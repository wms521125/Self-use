// ==UserScript==
// @name         阿里云盘
// @namespace    http://tampermonkey.net/
// @version      1.7.5
// @description  支持生成文件下载链接，支持视频播放页面打开自动播放/播放区点击暂停继续/播放控制器拖拽调整位置，支持自定义分享密码，突破视频2分钟限制，支持第三方播放器DPlayer（可自由切换），...
// @author       You
// @match        https://www.aliyundrive.com/s/*
// @match        https://www.aliyundrive.com/drive*
// @icon         https://gw.alicdn.com/imgextra/i3/O1CN01aj9rdD1GS0E8io11t_!!6000000000620-73-tps-16-16.ico
// @require      https://cdn.jsdelivr.net/npm/jquery@3/dist/jquery.min.js
// @run-at       document-body
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    var $ = $ || window.$;
    var obj = {
        file_page: {
            parent_file_id: "root",
            order_by: "",
            order_direction: "",
            next_marker_list: [],
            items: []
        },
        video_page: {
            play_info: {},
            file_id: "",
            elevideo: "",
            dPlayer: null,
            attributes: {},
            media_num: 0
        }
    };

    obj.customSharePwd = function () {
        $(document).on("DOMNodeInserted", ".ant-modal-root", function() {
            if ($(".input-share-pwd").length == 0) {
                var sharePwd = localStorage.getItem("share_pwd");
                var html = '<div class="pick-wrapper--3pNxV"><div class="ant-dropdown-trigger share-expire-wrapper--3y_Nn">自定义提取码</div></div>';
                html += '<input type="text" class="ant-input input-share-pwd" value="' + (sharePwd ? sharePwd : "") + '" placeholder="" style="margin-left: 12px;width: 99px;height: 28px;line-height: normal;border: 1px solid #D4D7DE;text-align: center;"></div>'
                $(".share-by-url--LfcNg").append(html);
            }
        });

        (function(send) {
            XMLHttpRequest.prototype.send = function() {
                if (arguments[0] && arguments[0].includes("expiration")) {
                    var sharePwd = localStorage.getItem("share_pwd");
                    if (sharePwd) {
                        var body = JSON.parse(arguments[0]);
                        body.share_pwd = sharePwd;
                        arguments[0] = JSON.stringify(body);
                    }
                }
                this.addEventListener("load", function() {
                    if (this.readyState == 4 && this.status == 200) {
                        var responseURL = this.responseURL;
                        if (responseURL.includes("/share_link/create") || responseURL.includes("/share_link/update")) {
                            var sharePwd = localStorage.getItem("share_pwd");
                            if (sharePwd) {
                                var response = JSON.parse(this.response);
                                if (response.share_pwd = sharePwd) {
                                    obj.showTipSuccess("自定义分享密码 成功");
                                }
                                else {
                                    localStorage.removeItem("share_pwd");
                                    obj.showTipError("自定义分享密码 失败，请修改分享密码后重试");
                                }
                            }
                        }
                    }
                }, false);
                send.apply(this, arguments);
            };
        })(XMLHttpRequest.prototype.send);

        $(document).on("change", ".input-share-pwd", function () {
            var value = this.value;
            localStorage.setItem("share_pwd", value);
        });
    };

    obj.unlockVideoLimit = function () {
        (function(open) {
            XMLHttpRequest.prototype.open = function() {
                if (!this._hooked) {
                    this._hooked = true;
                    setupHook(this);
                }
                open.apply(this, arguments);
            }
        })(XMLHttpRequest.prototype.open);

        function setupHook(xhr) {
            function setup() {
                Object.defineProperty(xhr, "responseText", {
                    get: function() {
                        delete xhr.responseText;
                        var responseText = xhr.responseText;
                        if (xhr.responseURL.includes("/file/get_share_link_video_preview_play_info") && responseText && responseText.includes("preview_url")) {
                            var responseJson = JSON.parse(responseText);
                            responseJson.video_preview_play_info.live_transcoding_task_list.forEach(function (item) {
                                item.preview_url = item.url || item.preview_url;
                            });
                            responseText = JSON.stringify(responseJson);
                        }
                        setup();
                        return responseText;
                    },
                    configurable: true
                });
            }
            setup();
        }
    };

    obj.switchPlayer = function () {
        $(document).on("click", ".header-more--a8O0Y, .ant-dropdown-trigger", function() {
            if (document.querySelector("video") || document.querySelector("#dplayer")) {
                if ($(".ant-switch-player").length == 0) {
                    var text = obj.getItem("default_player") == "Original" ? "切换到DPlayer播放器" : "切换到原生播放器";
                    $(".ant-dropdown-menu").append('<li class="ant-dropdown-menu-item ant-switch-player" role="menuitem"><div class="outer-menu--ihDUR"><div>' + text + '</div></div></li>');

                    $(".ant-switch-player").click(function() {
                        if (obj.getItem("default_player") == "Original") {
                            obj.setItem("default_player", "DPlayer");
                            $(this).find("div").find("div").text("切换到原生播放器");
                            obj.showTipSuccess("正在切换到DPlayer播放器");

                            obj.videoPageEvent();

                            obj.dplayerSupport();
                            setTimeout(function () {
                                obj.dplayerStart();
                            }, 1000);
                        }
                        else {
                            obj.setItem("default_player", "Original");
                            $(this).find("div").find("div").text("切换到DPlayer播放器");
                            obj.showTipSuccess("正在切换到原生播放器");

                            obj.videoPageEvent();

                            obj.video_page.dPlayer && obj.video_page.dPlayer.pause();
                            setTimeout(function () {
                                $(".dplayer").parent().append(obj.video_page.elevideo);
                                $(".dplayer").remove();
                                $(".video-player--29_72").css({display: "block"});
                                $(".video-player--29_72 .btn--1cZfA").click();
                            }, 1000);
                        }
                    });
                }
            }
            else {
                var ant_switch = $(".ant-switch-player");
                ant_switch.length && ant_switch.remove();
            }
        });
    };

    obj.videoPageEvent = function () {
        var default_player = obj.getItem("default_player");
        if (!default_player || default_player == "DPlayer") {
            $(document).off("DOMNodeInserted", ".video-player--29_72 .btn--1cZfA");
            $(document).off("click", "video");
            $(document).off("mouseover mouseout mousedown", ".video-player--29_72");
            return;
        }

        $(document).on("DOMNodeInserted", ".video-player--29_72 .btn--1cZfA", function() {
            var video = document.querySelector("video");
            if (video.paused) {
                $(this).click();
                setTimeout(function () {
                    try {
                        video.paused && video.play();
                        $(".video-player--29_72").css({opacity: 0});
                    } catch (a) {};
                }, 500);
            }
        });

        $(document).on("click", "video", function(event) {
            var elevideo = $(this).get(0);
            elevideo.paused && elevideo.play() || elevideo.pause();

            var opacity = elevideo.paused ? .9 : 0;
            $(".video-player--29_72").css({opacity: opacity});
        });

        $(document).on("mouseover mouseout mousedown", ".video-player--29_72", function(event) {
            var that = this;
            if (event.type == "mouseover" || event.type == "mouseout") {
                var opacity = event.type == "mouseover" ? .9 : 0;
                $(that).css({opacity: opacity});
                return;
            }

            var positionDiv = $(that).children("div:first").offset();
            var distenceX = event.pageX - positionDiv.left;
            var distenceY = event.pageY - positionDiv.top;

            $(document).mousemove(function(event){
                $(that).css({cursor: "move"});
                var $that = $(that).children("div:first");
                var $document = $(document);

                var offsetX = event.pageX - distenceX;
                var offsetY = event.pageY - distenceY;
                if(offsetX < 0) {
                    offsetX = 0;
                }
                else {
                    var widthDifference = $document.width() - $that.outerWidth(true);
                    if (offsetX > widthDifference) {
                        offsetX = widthDifference;
                    }
                }

                if(offsetY < 0){
                    offsetY = 0;
                }
                else {
                    var heightDifference = $document.height() - $that.outerHeight(true);
                    if(offsetY > heightDifference) {
                        offsetY = heightDifference;
                    }
                }

                $that.offset({
                    left: offsetX,
                    top: offsetY
                })
            })

            $(document).mouseup(function(e){
                $(that).css({cursor: ""});
                $(document).off("mousemove");
            })
        });
    };

    obj.dplayerSupport = function () {
        if (document.body) {
            if (obj.video_page.dPlayer || obj.getItem("default_player") == "Original") {
                return;
            }

            function loadScript(src) {
                var dom, extname = src.split(".").pop();
                if (extname == "js") {
                    dom = document.createElement("script");
                    dom.src = src;
                    dom.async = true;
                }
                else if ("css") {
                    dom = document.createElement("link");
                    dom.rel = "stylesheet";
                    dom.href = src;
                }
                document.body.appendChild(dom);
            }

            loadScript("https://cdn.jsdelivr.net/npm/hls.js/dist/hls.min.js");
            loadScript("https://cdn.jsdelivr.net/npm/dplayer/dist/DPlayer.min.css");
            loadScript("https://cdn.jsdelivr.net/npm/dplayer/dist/DPlayer.min.js");

            var css = document.createElement("style");
            css.textContent = "body{display:block!important;} .dplayer {max-width:100%;height:100%;}";
            document.head.appendChild(css);
        }
        else {
            setTimeout(obj.dplayerSupport, 500);
            return;
        }
    };

    obj.dplayerStart = function () {
        var default_player = obj.getItem("default_player");
        if (!default_player) {
            obj.showTipSuccess("脚本提示：打开页面右侧[更多]菜单可【切换播放器】", 5000);
        }
        else if (default_player == "Original") {
            return;
        }

        var dPlayerNode = document.getElementById("dplayer");
        if (!dPlayerNode) {
            dPlayerNode = document.createElement("div");
            dPlayerNode.setAttribute("id", "dplayer");
            var videoParentNode = document.querySelector("video").parentNode.parentNode;
            obj.video_page.elevideo = videoParentNode.parentNode.replaceChild(dPlayerNode, videoParentNode);
        }

        var dPlayer = obj.video_page.dPlayer, file_id = obj.video_page.play_info.file_id;
        if (dPlayer instanceof Object && obj.video_page.file_id == file_id) {
            obj.video_page.attributes = {
                currentTime: dPlayer.video.currentTime,
                playbackRate: dPlayer.video.playbackRate,
                muted: dPlayer.video.muted,
            };

            dPlayer.destroy();
        }
        else {
            if (obj.video_page.file_id != file_id) {
                obj.video_page.file_id = file_id;
                obj.video_page.attributes = {};
            }
        }

        var options = {
            container: document.getElementById("dplayer"),
            video: {
                quality: [],
                defaultQuality: 0
            },
            autoplay: true,
            screenshot: true,
            hotkey: true,
            airplay: true,
            volume: 1.0,
            playbackSpeed: [0.5, 0.75, 1, 1.25, 1.5, 2],
            contextmenu: [],
            theme: "#b7daff"
        };

        var play_info = obj.video_page.play_info.video_preview_play_info || {};
        if (Array.isArray(play_info.live_transcoding_task_list)) {
            var task_list = play_info.live_transcoding_task_list;
            var p = {
                FHD: "1080 全高清",
                HD: "720 高清",
                SD: "540 标清",
                LD: "360 流畅"
            };
            task_list.forEach(function (item) {
                options.video.quality.push({
                    name: p[item.template_id],
                    url: item.url || item.preview_url,
                    type: "hls"
                });
            });

            options.video.defaultQuality = task_list.length - 1;
        }
        else {
            if (play_info.file_id) {
                obj.getVideoPreviewPlayInfo();
            }
            else {
                obj.showTipError("获取播放信息失败：请刷新网页重试");
            }
            return;
        }

        dPlayer = new window.DPlayer(options);
        obj.video_page.dPlayer = dPlayer;

        dPlayer.on("loadedmetadata", function () {
            var attributes = obj.video_page.attributes;
            if (Object.keys(attributes).length) {
                dPlayer.seek(attributes.currentTime);
                dPlayer.speed(attributes.playbackRate);
                dPlayer.video.muted = attributes.muted;
            }
        });
    };

    obj.getVideoPreviewPlayInfo = function () {
        if (location.href.includes("aliyundrive.com/s/")) {
            obj.get_share_link_video_preview_play_info();
        }
        else {
            obj.get_video_preview_play_info();
        }
    }

    obj.get_share_link_video_preview_play_info = function (callback) {
        var token = obj.getItem("token") || {}, share_id = obj.getShareId(), file_id = obj.video_page.play_info.file_id;
        $.ajax({
            type: "post",
            url: "https://api.aliyundrive.com/v2/file/get_share_link_video_preview_play_info",
            data: JSON.stringify({
                category: "live_transcoding",
                file_id: file_id,
                get_preview_url: true,
                share_id: share_id,
                template_id: ""
            }),
            headers: {
                "authorization": "".concat(token.token_type || "", " ").concat(token.access_token || ""),
                "content-type": "application/json;charset=UTF-8",
                "x-share-token": obj.getItem("shareToken").share_token
            },
            async: true,
            success: function (response) {
                callback && callback(response);
            },
            error: function (error) {
                if (error.responseJSON.code == "AccessTokenInvalid") {
                    obj.refresh_token(function (response) {
                        if (response instanceof Object) {
                            obj.get_share_link_video_preview_play_info(callback);
                        }
                        else {
                            callback && callback("");
                        }
                    });
                }
                else if (error.responseJSON.code == "ShareLinkTokenInvalid") {
                    obj.get_share_token(function (response) {
                        if (response instanceof Object) {
                            obj.get_share_link_video_preview_play_info(callback);
                        }
                        else {
                            callback && callback("");
                        }
                    });
                }
                else {
                    console.error("get_share_link_video_preview_play_info 错误", error);
                    if (error.responseJSON.code == "InvalidParameterNotMatch.ShareId") {
                        obj.showTipError("错误：参数不匹配，此错误可能是打开了另一个分享页面导致，请刷新", 10000);
                    }
                    callback && callback("");
                }
            }
        });
    };

    obj.get_video_preview_play_info = function (callback) {
        var token = obj.getItem("token") || {}, file_id = obj.video_page.play_info.file_id;
        $.ajax({
            type: "post",
            url: "https://api.aliyundrive.com/v2/file/get_video_preview_play_info",
            data: JSON.stringify({
                category: "live_transcoding",
                drive_id: token.default_drive_id,
                file_id: file_id,
                template_id: ""
            }),
            headers: {
                "authorization": "".concat(token.token_type || "", " ").concat(token.access_token || ""),
                "content-type": "application/json;charset=UTF-8",
            },
            async: true,
            success: function (response) {
                callback && callback(response);
            },
            error: function (error) {
                if (error.responseJSON.code == "AccessTokenInvalid") {
                    obj.refresh_token(function (response) {
                        if (response instanceof Object) {
                            obj.get_video_preview_play_info(callback);
                        }
                        else {
                            callback && callback("");
                        }
                    });
                }
                else {
                    console.error("get_video_preview_play_info 错误", error);
                    callback && callback("");
                }
            }
        });
    };

    obj.expires = function (e) {
        var t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 6e3
        , n = e.match(/&x-oss-expires=(\d+)&/);
        return !n || n && n[1] && +"".concat(n[1], "000") - t < Date.now();
    }

    obj.initDownloadSharePage = function () {
        if ($(".button-download--batch").length) {
            return;
        }
        if ($("#root header").length) {
            var html = '<button class="button--2Aa4u primary--3AJe5 small---B8mi button-download--batch">显示链接</button>';
            $("#root header:eq(0)").append(html);
            $(".button-download--batch").on("click", obj.showDownloadSharePage);
        }
        else {
            setTimeout(obj.initDownloadSharePage, 500)
        }
    };

    obj.initDownloadHomePage = function () {
        if ($(".button-download--batch").length) {
            return;
        }
        if ($("#root header").length) {
            var html = '<div style="margin:0px 8px;"></div><button class="button--2Aa4u primary--3AJe5 small---B8mi button-download--batch">显示链接</button>';
            $("#root header:eq(0)").append(html);
            $(".button-download--batch").on("click", obj.showDownloadHomePage);
        }
        else {
            setTimeout(obj.initDownloadHomePage, 1000)
        }
    };

    obj.showDownloadSharePage = function () {
        var token = obj.getItem("token");
        if (token && token.access_token) {
            obj.showTipLoading("正在获取链接...");
        }
        else {
            obj.showTipError("缺少必要参数，请登陆后刷新此页面重试！");
            return;
        }

        var fileList = obj.getSelectedFileList();
        if (fileList.length == 0) {
            console.error("致命错误：获取分享文件列表失败");
            obj.showTipError("致命错误：获取分享文件列表失败");
            return;
        }

        obj.showBox('<div class="item-list" style="padding: 20px; height: 410px; overflow-y: auto;"></div>');
        var rowStyle = "margin:10px 0px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;";

        var share_id = obj.getShareId();
        fileList.forEach(function (item, index) {
            var html = '<p>' + (++index) + '：' + item.name + '</p>';
            if (item.download_url) {
                html += '<p style="' + rowStyle + '"><a title="' + item.download_url + '" href="' + item.download_url + '" style="color: blue;">' + item.download_url + '</a></p>';
                $(".item-list").append(html);
            }
            else {
                if (item.type == "folder") {
                    html += '<p style="' + rowStyle + '"><font color="green">&emsp;&emsp;请进入文件夹下载</font></p>';
                    $(".item-list").append(html);
                }
                else {
                    setTimeout(function() {
                        obj.getShareLinkDownloadUrl(item.file_id, share_id, function (download_url) {
                            item.download_url = download_url;
                            html += '<p style="' + rowStyle + '"><a title="' + item.download_url + '" href="' + item.download_url + '" style="color: blue;">' + item.download_url + '</a></p>';
                            $(".item-list").append(html);
                        });
                    }, 66 * index);
                }
            }
        });

        obj.hideTip();
    };

    obj.showDownloadHomePage = function () {
        var token = obj.getItem("token");
        if (token && token.access_token) {
            obj.showTipLoading("正在获取链接...");
        }
        else {
            obj.showTipError("缺少必要参数，请刷新此页面重试！");
            return;
        }

        var fileList = obj.getSelectedFileList();
        if (fileList.length == 0) {
            console.error("致命错误：获取个人文件列表失败");
            obj.showTipError("致命错误：获取个人文件列表失败");
            return;
        }

        obj.showBox('<div class="item-list" style="padding: 20px; height: 410px; overflow-y: auto;"></div>');
        var rowStyle = "margin:10px 0px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;";
        var Re = function(e) {
            var t = document.createElement("a");
            t.rel = "noopener";
            t.href = e;
            t.download = "download";
            //t.target = "_blank";
            (function(e) {
                try {
                    e.dispatchEvent(new MouseEvent("click"))
                } catch (n) {
                    var t = document.createEvent("MouseEvents");
                    t.initMouseEvent("click", !0, !0, window, 0, 0, 0, 80, 20, !1, !1, !1, !1, 0, null);
                    e.dispatchEvent(t);
                }
            }(t));
        };

        fileList.forEach(function (item, index) {
            var html = '<p>' + (++index) + '：' + item.name + '</p>';
            if (item.download_url) {
                html += '<p style="' + rowStyle + '"><a title="' + item.download_url + '" style="color: blue;">' + item.download_url + '</a></p>';
                $(".item-list").append(html);
            }
            else {
                if (item.type == "folder") {
                    html += '<p style="' + rowStyle + '"><font color="green">&emsp;&emsp;请进入文件夹下载</font></p>';
                    $(".item-list").append(html);
                }
                else {
                    setTimeout(function() {
                        obj.getHomeLinkDownloadUrl(item.file_id, item.drive_id, function (download_url) {
                            item.download_url = download_url;
                            html += '<p style="' + rowStyle + '"><a title="' + item.download_url + '" style="color: blue;">' + item.download_url + '</a></p>';
                            $(".item-list").append(html);
                        });
                    }, 66 * index);
                }
            }
        });

        obj.hideTip();

        $(document).on("click", ".item-list a", function(event) {
            var url = $(this).attr("href");
            if (!url) {
                url = $(this).attr("title");
                Re(url);
            }
        });
    };

    obj.showBox = function (body) {
        var template = '<div class="ant-modal-root ant-modal-my"><div class="ant-modal-mask"></div><div tabindex="-1" class="ant-modal-wrap" role="dialog"><div role="document" class="ant-modal modal-wrapper--2yJKO" style="width: 666px;"><div class="ant-modal-content"><div class="ant-modal-header"><div class="ant-modal-title" id="rcDialogTitle1">文件下载</div></div><div class="ant-modal-body"><div class="icon-wrapper--3dbbo"><span data-role="icon" data-render-as="svg" data-icon-type="PDSClose" class="close-icon--33bP0 icon--d-ejA "><svg viewBox="0 0 1024 1024"><use xlink:href="#PDSClose"></use></svg></span></div>';
        template += body;
        template += '</div><div class="ant-modal-footer"></div></div></div></div></div>';
        $("body").append(template);
        $(".icon-wrapper--3dbbo").one("click", function () {
            $(".ant-modal-my").remove();
        });

        //$(".ant-modal.modal-wrapper--2yJKO").css({width: "666px"}); //调整宽度（"666px" 改成 "777px"  "888px"  "999px" ...）
        $(".ant-modal-wrap").off("click").on("click", function (event) {
            //点击链接窗口外部自动关闭窗口
            if ($(event.target).closest(".ant-modal-content").length == 0) {
                $(".ant-modal-my").remove();
            }
        });
    };

    obj.getSelectedFileList = function () {
        var selectedFileList = [], fileList = obj.file_page.items;
        if (fileList.length == 0) {
            console.error("致命错误：劫持文件列表失败");
            return [];
        }

        var $node = "";
        if ($(".tbody--3Y4Fn  .tr--5N-1q.tr--3Ypim").length) {
            $node = $(".tbody--3Y4Fn  .tr--5N-1q.tr--3Ypim");
        }
        else if ($(".outer-wrapper--25yYA").length) {
            $node = $(".outer-wrapper--25yYA");
        }
        $node.each(function (index) {
            var $this = $(this);
            if ($this.attr("data-is-selected") == "true") {
                var data_index = $this.closest("[data-index]").attr("data-index");
                data_index && selectedFileList.push(fileList[data_index]);
            }
        });

        return selectedFileList.length ? selectedFileList : fileList;
    };

    obj.getShareLinkDownloadUrl = function (file_id, share_id, callback) {
        var token = obj.getItem("token") || {};
        $.ajax({
            type: "post",
            url: "https://api.aliyundrive.com/v2/file/get_share_link_download_url",
            data: JSON.stringify({
                expire_sec: 600,
                file_id: file_id,
                share_id: share_id
            }),
            headers: {
                "authorization": "".concat(token.token_type || "", " ").concat(token.access_token || ""),
                "content-type": "application/json;charset=utf-8",
                "x-share-token": obj.getItem("shareToken").share_token
            },
            async: true,
            success: function (response) {
                if (response instanceof Object && response.download_url) {
                    callback && callback(response.download_url);
                }
                else {
                    console.error("getShareLinkDownloadUrl 失败", response);
                    callback && callback("");
                }
            },
            error: function (error) {
                if (error.responseJSON.code == "AccessTokenInvalid") {
                    obj.refresh_token(function (response) {
                        if (response instanceof Object) {
                            obj.getShareLinkDownloadUrl(file_id, share_id, callback);
                        }
                        else {
                            callback && callback("");
                        }
                    });
                }
                else if (error.responseJSON.code == "ShareLinkTokenInvalid") {
                    obj.get_share_token(function (response) {
                        if (response instanceof Object) {
                            obj.getShareLinkDownloadUrl(file_id, share_id, callback);
                        }
                        else {
                            callback && callback("");
                        }
                    });
                }
                else {
                    console.error("getShareLinkDownloadUrl 错误", error);
                    if (error.responseJSON.code == "InvalidParameterNotMatch.ShareId") {
                        obj.showTipError("错误：参数不匹配，此错误可能是打开了另一个分享页面导致，请刷新", 10000);
                    }
                    callback && callback("");
                }
            }
        });
    };

    obj.getHomeLinkDownloadUrl = function (file_id, drive_id, callback) {
        var token = obj.getItem("token") || {};
        $.ajax({
            type: "post",
            url: "https://api.aliyundrive.com/v2/file/get_download_url",
            data: JSON.stringify({
                drive_id: drive_id,
                file_id: file_id
            }),
            headers: {
                "authorization": "".concat(token.token_type || "", " ").concat(token.access_token || ""),
                "content-type": "application/json;charset=utf-8"
            },
            async: true,
            success: function (response) {
                if (response instanceof Object && response.url) {
                    callback && callback(response.url);
                }
                else {
                    console.error("getHomeLinkDownloadUrl 失败", response);
                    callback && callback("");
                }
            },
            error: function (error) {
                if (error.responseJSON.code == "AccessTokenInvalid") {
                    obj.refresh_token(function (response) {
                        if (response instanceof Object) {
                            obj.getHomeLinkDownloadUrl(file_id, drive_id, callback);
                        }
                        else {
                            callback && callback("");
                        }
                    });
                }
                else {
                    console.error("getHomeLinkDownloadUrl 错误", error);
                    callback && callback("");
                }
            }
        });
    };

    obj.refresh_token = function (callback) {
        var token = obj.getItem("token");
        if (!(token && token.refresh_token)) {
            obj.showTipError("缺少必要参数，请登陆后刷新此页面重试！", 10000);
            callback && callback("");
            return;
        }
        $.ajax({
            type: "post",
            url: "https://api.aliyundrive.com/token/refresh",
            data: JSON.stringify({
                refresh_token: token.refresh_token
            }),
            headers: {
                "Content-type": "application/json;charset=utf-8",
            },
            success: function (response) {
                if (response instanceof Object && response.access_token) {
                    obj.showTipLoading("更新 token");
                    delete response.user_data;
                    obj.setItem("token", response);
                    callback && callback(response);
                }
                else {
                    callback && callback("");
                }
            },
            error: function () {
                callback && callback("");
            }
        });
    };

    obj.get_share_token = function (callback) {
        $.ajax({
            type: "post",
            url: "https://api.aliyundrive.com/v2/share_link/get_share_token",
            data: JSON.stringify({
                share_id: obj.getShareId(),
                share_pwd: ""
            }),
            headers: {
                "Content-type": "application/json;charset=utf-8",
            },
            success: function (response) {
                if (response instanceof Object && response.share_token) {
                    obj.showTipLoading("更新 share_token");
                    obj.setItem("shareToken", response);
                    callback && callback(response);
                }
                else {
                    callback && callback("");
                }
            },
            error: function (error) {
                if (error.responseJSON.code == "InvalidResource.SharePwd") {
                    obj.showTipError("更新share_token错误，请刷新并重新填写提取码", 10000);
                }
                callback && callback("");
            }
        });
    };

    obj.getShareId = function () {
        var url = location.href;
        var match = url.match(/aliyundrive\.com\/s\/([a-zA-Z\d]+)/);
        return match ? match[1] : null;
    };

    obj.getItem = function(n) {
        n = window.localStorage.getItem(n);
        if (!n) {
            return null;
        }
        try {
            return JSON.parse(n);
        } catch (e) {
            return n;
        }
    };

    obj.setItem = function(n, t) {
        n && t && window.localStorage.setItem(n, t instanceof Object ? JSON.stringify(t) : t);
    };

    obj.showTipSuccess = function (msg, timeout) {
        obj.hideTip();

        var $element = $(".aDrive div");
        if ($element.length) {
            $element.append('<div class="aDrive-notice"><div class="aDrive-notice-content"><div class="aDrive-custom-content aDrive-success"><span data-role="icon" data-render-as="svg" data-icon-type="PDSCheckmarkCircleFill" class="success-icon--2Zvcy icon--d-ejA "><svg viewBox="0 0 1024 1024"><use xlink:href="#PDSCheckmarkCircleFill"></use></svg></span><span><div class="content-wrapper--B7mAG" data-desc="false" style="margin-left: 44px; padding-right: 20px;"><div class="title-wrapper--3bQQ2">' + msg + '<div class="desc-wrapper--218x0"></div></div></div></span></div></div>');
        }
        else {
            $(document.body).append('<div class="aDrive"><div><div class="aDrive-notice"><div class="aDrive-notice-content"><div class="aDrive-custom-content aDrive-success"><span data-role="icon" data-render-as="svg" data-icon-type="PDSCheckmarkCircleFill" class="success-icon--2Zvcy icon--d-ejA "><svg viewBox="0 0 1024 1024"><use xlink:href="#PDSCheckmarkCircleFill"></use></svg></span><span><div class="content-wrapper--B7mAG" data-desc="false" style="margin-left: 44px; padding-right: 20px;"><div class="title-wrapper--3bQQ2">' + msg + '<div class="desc-wrapper--218x0"></div></div></div></span></div></div></div></div></div>');
        }

        setTimeout(function () {
            obj.hideTip();
        }, timeout || 3000);
    };

    obj.showTipError = function (msg, timeout) {
        obj.hideTip();

        var $element = $(".aDrive div");
        if ($element.length) {
            $element.append('<div class="aDrive-notice"><div class="aDrive-notice-content"><div class="aDrive-custom-content aDrive-error"><span data-role="icon" data-render-as="svg" data-icon-type="PDSCloseCircleFill" class="error-icon--1Ov4I icon--d-ejA "><svg viewBox="0 0 1024 1024"><use xlink:href="#PDSCloseCircleFill"></use></svg></span><span><div class="content-wrapper--B7mAG" data-desc="false" style="margin-left: 44px; padding-right: 20px;"><div class="title-wrapper--3bQQ2">' + msg + '<div class="desc-wrapper--218x0"></div></div></div></span></div></div></div>');
        }
        else {
            $(document.body).append('<div><div class="aDrive"><div><div class="aDrive-notice"><div class="aDrive-notice-content"><div class="aDrive-custom-content aDrive-error"><span data-role="icon" data-render-as="svg" data-icon-type="PDSCloseCircleFill" class="error-icon--1Ov4I icon--d-ejA "><svg viewBox="0 0 1024 1024"><use xlink:href="#PDSCloseCircleFill"></use></svg></span><span><div class="content-wrapper--B7mAG" data-desc="false" style="margin-left: 44px; padding-right: 20px;"><div class="title-wrapper--3bQQ2">' + msg + '<div class="desc-wrapper--218x0"></div></div></div></span></div></div></div></div></div></div>');
        }

        setTimeout(function () {
            obj.hideTip()
        }, timeout || 3000);
    };

    obj.showTipLoading = function (msg, timeout) {
        obj.hideTip();

        var $element = $(".aDrive div");
        if ($element.length) {
            $element.append('<div class="aDrive-notice"><div class="aDrive-notice-content"><div class="aDrive-custom-content aDrive-loading"><div></div><span><div class="content-wrapper--B7mAG" data-desc="false" style="margin-left: 20px; padding-right: 20px;"><div class="title-wrapper--3bQQ2">' + msg + '<div class="desc-wrapper--218x0"></div></div></div></span></div></div></div>');
        }
        else {
            $(document.body).append('<div><div class="aDrive"><div><div class="aDrive-notice"><div class="aDrive-notice-content"><div class="aDrive-custom-content aDrive-loading"><div></div><span><div class="content-wrapper--B7mAG" data-desc="false" style="margin-left: 20px; padding-right: 20px;"><div class="title-wrapper--3bQQ2">' + msg + '<div class="desc-wrapper--218x0"></div></div></div></span></div></div></div></div></div></div>');
        }

        setTimeout(function () {
            obj.hideTip()
        }, timeout || 5000);
    };

    obj.hideTip = function() {
        var t = $(".aDrive-notice");
        t.length && "function" == typeof t.remove ? t.remove() : "function" == typeof t.removeNode && t.removeNode(!0);
    };

    obj.addPageFileList = function () {
        var send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(data) {
            this.addEventListener("load", function(event) {
                if (this.readyState == 4 && this.status == 200) {
                    var response, responseURL = this.responseURL;
                    if (responseURL.indexOf("/file/list") > 0) {
                        if (document.querySelector(".ant-modal-mask")) {
                            //排除【保存 移动 等行为触发】
                            return;
                        };

                        response = JSON.parse(this.response);
                        if (response instanceof Object && response.items) {
                            var parent_file_id = ((location.href.match(/\/folder\/(\w+)/) || [])[1]) || "root";
                            if (parent_file_id != obj.file_page.parent_file_id) {
                                //变换页面
                                obj.file_page.parent_file_id = parent_file_id;
                                obj.file_page.order_by = data.order_by;
                                obj.file_page.order_direction = data.order_direction;
                                obj.file_page.next_marker_list = [];
                                obj.file_page.items = [];
                            }

                            data = JSON.parse(data);
                            if (data.order_by != obj.file_page.order_by || data.order_direction != obj.file_page.order_direction) {
                                //排序改变
                                obj.file_page.order_by = data.order_by;
                                obj.file_page.order_direction = data.order_direction;
                                obj.file_page.next_marker_list = [];
                                obj.file_page.items = [];
                            }

                            var next_marker = response.next_marker, next_marker_list = obj.file_page.next_marker_list;
                            if (next_marker_list.includes(next_marker)) {
                                if (next_marker_list.indexOf(next_marker) == 0) {
                                    //重复排序
                                    obj.file_page.next_marker_list = [response.next_marker];
                                    obj.file_page.items = [];
                                }
                            }
                            else {
                                obj.file_page.next_marker_list.push(response.next_marker)
                            }

                            obj.file_page.items = obj.file_page.items.concat(response.items);
                            obj.showTipSuccess("文件列表获取完成 共：" + obj.file_page.items.length + "项");

                            var url = location.href;
                            if (url.indexOf(".aliyundrive.com/s/") > 0) {
                                obj.initDownloadSharePage();
                            }
                            else if (url.indexOf(".aliyundrive.com/drive") > 0) {
                                obj.initDownloadHomePage();
                            }
                        }
                    }
                    else if ((responseURL.indexOf("/file/get_share_link_video_preview_play_info") > 0 || responseURL.indexOf("/file/get_video_preview_play_info") > 0)) {
                        response = JSON.parse(this.response);
                        if (response instanceof Object && response.file_id) {
                            obj.video_page.play_info = response;
                            obj.getItem("default_player") != "Original" && obj.dplayerStart();
                        }
                    }
                }
                else if (this.readyState == 4 && this.status == 403) {
                    if (this.responseURL.match(/media-\d+\.ts/) && obj.expires(this.responseURL)) {
                        if (obj.getItem("default_player") != "Original" && obj.video_page.dPlayer) {
                            var media_num = (this.responseURL.match(/media-(\d+)\.ts/) || [])[1] || 0;
                            if (media_num > 5 && obj.video_page.media_num != media_num) {
                                obj.video_page.media_num = media_num;
                                obj.getVideoPreviewPlayInfo();
                            }
                        }
                    }
                }
            }, false);
            send.apply(this, arguments);
        };
    };

    var url = location.href;
    if (url.indexOf(".aliyundrive.com/s/") > 0) {
        obj.addPageFileList();

        obj.unlockVideoLimit();

        obj.dplayerSupport();
        obj.switchPlayer();
        obj.videoPageEvent();
    }
    else if (url.indexOf(".aliyundrive.com/drive") > 0) {
        obj.addPageFileList();

        obj.customSharePwd();

        obj.dplayerSupport();
        obj.switchPlayer();
        obj.videoPageEvent();
    }
    console.log("=== 阿里云盘 好棒棒！===");

    // Your code here...
})();
