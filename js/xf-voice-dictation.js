; (function (window, voice) {
    "use strict";
    // 根据不同的环境将 Voice 相关的模块暴露出去，以供其他模块或文件使用。
    if (typeof define === 'function' && define.amd) {
        // 判断当前环境是否支持 AMD 模块定义，如果支持，则通过 define 方法将 voice 模块暴露出去。
        define(voice);
    } else if (typeof exports === 'object') {
        // 如果当前环境是 Node.js 环境，判断是否存在 exports 对象，如果存在则通过 module.exports 导出 voice 模块。
        module.exports = voice();
    } else {
        // 如果以上两种情况都不符合，就将 voice 模块挂载到全局对象 window 下的 XfVoiceDictation 属性上。
        window.XfVoiceDictation = voice();
    };
}(typeof window !== "undefined" ? window : this/**同样也是为了区分不同环境 */, () => {
    "use strict";
    return class IatRecorder {/**返回一个类 */
        constructor(opts = {}) {
            // 服务接口认证信息(语音听写（流式版）WebAPI)
            this.APPID = opts.APPID || '';
            this.APISecret = opts.APISecret || '';
            this.APIKey = opts.APIKey || '';

            // webSocket请求地址
            this.url = opts.url || "wss://iat-api.xfyun.cn/v2/iat";
            this.host = opts.host || "iat-api.xfyun.cn";

            // 识别监听方法
            this.onTextChange = opts.onTextChange || Function();/** 监听识别结果的变化回调 */
            this.onWillStatusChange = opts.onWillStatusChange || Function();/** 监听录音状态变化回调  status：null | init | ing | end */
           
            // 方言/语种
            this.status = 'null'
            this.language = opts.language || 'zh_cn'
            this.accent = opts.accent || 'mandarin';/** 方言：中文普通话 */
            
            // 流媒体
            this.streamRef = [];
            // 记录音频数据
            this.audioData = [];
            // 记录听写结果
            this.resultText = '';
            // wpgs下的听写结果需要中间状态辅助记录
            this.resultTextTemp = '';
            // 音频数据多线程
            this.init();
        };

        // 获取webSocket请求地址鉴权
        getWebSocketUrl() {
            return new Promise((resolve, reject) => {
                const { url, host, APISecret, APIKey } = this;
                // 请求地址根据语种不同变化
                try {
                    const CryptoJS = require('crypto-js');
                    let date = new Date().toGMTString(),
                        algorithm = 'hmac-sha256',
                        headers = 'host date request-line',
                        signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/iat HTTP/1.1`,
                        signatureSha = CryptoJS.HmacSHA256(signatureOrigin, APISecret),
                        signature = CryptoJS.enc.Base64.stringify(signatureSha),
                        authorizationOrigin = `api_key="${APIKey}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`,
                        authorization = btoa(authorizationOrigin);
                    resolve(`${url}?authorization=${authorization}&date=${date}&host=${host}`);
                } catch (error) {
                    let date = new Date().toGMTString(),
                        algorithm = 'hmac-sha256',
                        headers = 'host date request-line',
                        signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/iat HTTP/1.1`,
                        signatureSha = CryptoJS.HmacSHA256(signatureOrigin, APISecret),
                        signature = CryptoJS.enc.Base64.stringify(signatureSha),
                        authorizationOrigin = `api_key="${APIKey}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`,
                        authorization = btoa(authorizationOrigin);
                    resolve(`${url}?authorization=${authorization}&date=${date}&host=${host}`);
                };
            });
        };

        // 操作初始化
        /** 初始化一个 Worker ，并在 onmessage 事件中拿到转换后的音频数据 */
        init() {
            const self = this;
            try {
                if (!self.APPID || !self.APIKey || !self.APISecret) {
                    alert('请正确配置【迅飞语音听写（流式版）WebAPI】服务接口认证信息！');
                } else {
                    self.webWorker = new Worker('./js/transcode.worker.js');/** 为什么是 ./js/transcode.worker.js 而非 ./transcode.worker.js ？ */
                    self.webWorker.onmessage = function (event) {
                        self.audioData.push(...event.data);
                    };
                }
            } catch (error) {
                alert('对不起：请在服务器环境下运行！');
                console.error('请在服务器如：WAMP、XAMPP、Phpstudy、http-server、WebServer等环境中运行！', error);
            };
            console.log("%c ❤️使用说明：http://www.muguilin.com/blog/info/609bafc50d572b3fd79b058f", "font-size:32px; color:blue; font-weight: bold;");
        };
        // 修改录音听写状态
        setStatus(status) {
            this.onWillStatusChange && this.status !== status && this.onWillStatusChange(this.status, status);
            this.status = status;
        };
        // 设置识别结果内容
        setResultText({ resultText, resultTextTemp } = {}) {
            this.onTextChange && this.onTextChange(resultTextTemp || resultText || '');
            resultText !== undefined && (this.resultText = resultText);
            resultTextTemp !== undefined && (this.resultTextTemp = resultTextTemp);
        };
        // 修改听写参数
        setParams({ language, accent } = {}) {
            language && (this.language = language)
            accent && (this.accent = accent)
        };
        // 对处理后的音频数据进行base64编码，
        toBase64(buffer) {
            let binary = '';
            let bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return window.btoa(binary);
        };
        // 连接WebSocket
        connectWebSocket() {
            return this.getWebSocketUrl().then(url => {
                let iatWS;
                if ('WebSocket' in window) {/** 如果指定的属性在指定的对象或其原型链中，则 in 运算符返回 true。 */
                    iatWS = new WebSocket(url);
                } else if ('MozWebSocket' in window) {
                    iatWS = new MozWebSocket(url);
                } else {
                    alert('浏览器不支持WebSocket!');
                    return false;
                }
                this.webSocket = iatWS;
                this.setStatus('init');
                iatWS.onopen = e => {
                    this.setStatus('ing');
                    // 重新开始录音
                    setTimeout(() => {
                        this.webSocketSend();
                    }, 500);
                };
                iatWS.onmessage = e => {
                    this.webSocketRes(e.data);
                };
                iatWS.onerror = e => {
                    this.recorderStop(e);
                };
                iatWS.onclose = e => {
                    this.recorderStop(e);
                };
            })
        };
        // 初始化浏览器录音
        recorderInit() {
            // 创建音频环境
            try {
                this.audioContext = this.audioContext ? this.audioContext : new (window.AudioContext || window.webkitAudioContext)();
                this.audioContext.resume();/**AudioContext 的 resume() 方法，恢复之前暂停播放的音频。 */
                if (!this.audioContext) {
                    alert('浏览器不支持webAudioApi相关接口');
                    return false;
                }
            } catch (e) {
                if (!this.audioContext) {
                    alert('浏览器不支持webAudioApi相关接口');
                    return false;
                }
            };
            // 获取浏览器录音权限成功时回调
            let getMediaSuccess = _ => {
                // 创建一个用于通过JavaScript直接处理音频
                this.scriptProcessor = this.audioContext.createScriptProcessor(0, 1, 1);
                this.scriptProcessor.onaudioprocess = e => {
                    if (this.status === 'ing') {
                        // 多线程音频数据处理
                        try {
                            this.webWorker.postMessage(e.inputBuffer.getChannelData(0));
                        } catch (error) { }
                    }
                }
                // 创建一个新的MediaStreamAudioSourceNode 对象，使来自MediaStream的音频可以被播放和操作
                this.mediaSource = this.audioContext.createMediaStreamSource(this.streamRef);
                this.mediaSource.connect(this.scriptProcessor);
                this.scriptProcessor.connect(this.audioContext.destination);
                this.connectWebSocket();
            };
            // 获取浏览器录音权限失败时回调
            let getMediaFail = (e) => {
                alert('对不起：录音权限获取失败!');
                this.audioContext && this.audioContext.close();
                this.audioContext = undefined;
                // 关闭websocket
                if (this.webSocket && this.webSocket.readyState === 1) {
                    this.webSocket.close();
                }
            };
            navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
            // 获取浏览器录音权限
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({
                    audio: true
                }).then(stream => {
                    this.streamRef = stream;
                    getMediaSuccess();
                }).catch(e => {
                    getMediaFail(e);
                })
            } else if (navigator.getUserMedia) {
                navigator.getUserMedia({
                    audio: true
                }, (stream) => {
                    this.streamRef = stream;
                    getMediaSuccess();
                }, function (e) {
                    getMediaFail(e);
                })
            } else {
                if (navigator.userAgent.toLowerCase().match(/chrome/) && location.origin.indexOf('https://') < 0) {
                    console.error('获取浏览器录音功能，因安全性问题，需要在localhost 或 127.0.0.1 或 https 下才能获取权限！');
                } else {
                    alert('对不起：未识别到录音设备!');
                }
                this.audioContext && this.audioContext.close();
                return false;
            };
        };
        // 向webSocket发送数据(音频二进制数据经过Base64处理)
        webSocketSend() {
            if (this.webSocket.readyState/** CONNECTING:0、OPEN:1、CLOSING:2、CLOSED:3 */ !== 1) return false;
            // 音频数据
            const audioData = this.audioData.splice(0, 1280);/** web work 发送的音频数据 */
            const params = {/**讯飞实时转写要求的格式 */
                common: {
                    app_id: this.APPID,
                },
                business: {
                    language: this.language, //小语种可在控制台--语音听写（流式）--方言/语种处添加试用
                    domain: 'iat',
                    accent: this.accent, //中文方言可在控制台--语音听写（流式）--方言/语种处添加试用
                    vad_eos: 5000,
                    dwa: 'wpgs' //为使该功能生效，需到控制台开通动态修正功能（该功能免费）
                },
                data: {
                    status: 0,
                    format: 'audio/L16;rate=16000',
                    encoding: 'raw',
                    audio: this.toBase64(audioData)
                }
            };
            // 发送数据
            this.webSocket.send(JSON.stringify(params));
            this.handlerInterval = setInterval(() => {
                // websocket未连接
                if (this.webSocket.readyState !== 1) {
                    this.audioData = [];
                    clearInterval(this.handlerInterval);
                    return false;
                };
                if (this.audioData.length === 0) {
                    if (this.status === 'end') {
                        this.webSocket.send(
                            JSON.stringify({
                                data: {
                                    status: 2,
                                    format: 'audio/L16;rate=16000',
                                    encoding: 'raw',
                                    audio: ''
                                }
                            })
                        );
                        this.audioData = [];
                        clearInterval(this.handlerInterval);
                    }
                    return false;
                };
                // 中间帧
                this.webSocket.send(
                    JSON.stringify({
                        data: {
                            status: 1,
                            format: 'audio/L16;rate=16000',
                            encoding: 'raw',
                            audio: this.toBase64(this.audioData.splice(0, 1280))
                        }
                    })
                );
            }, 40);
        };
        // 识别结束 webSocket返回数据
        webSocketRes(resultData) {
            let jsonData = JSON.parse(resultData);
            if (jsonData.data && jsonData.data.result) {
                let data = jsonData.data.result;
                let str = '';
                let ws = data.ws;
                for (let i = 0; i < ws.length; i++) {
                    str = str + ws[i].cw[0].w;
                }
                // 开启wpgs会有此字段(前提：在控制台开通动态修正功能)
                // 取值为 "apd"时表示该片结果是追加到前面的最终结果；取值为"rpl" 时表示替换前面的部分结果，替换范围为rg字段
                if (data.pgs) {
                    if (data.pgs === 'apd') {
                        // 将resultTextTemp同步给resultText
                        this.setResultText({
                            resultText: this.resultTextTemp
                        });
                    }
                    // 将结果存储在resultTextTemp中
                    this.setResultText({
                        resultTextTemp: this.resultText + str
                    });
                } else {
                    this.setResultText({
                        resultText: this.resultText + str
                    });
                }
            }
            if (jsonData.code === 0 && jsonData.data.status === 2) {
                this.webSocket.close();
            }
            if (jsonData.code !== 0) {
                this.webSocket.close();
            }
        };
        // 启动录音
        recorderStart() {
            if (!this.audioContext) {/** 如果初始有音频数据的话就初始化浏览器录音*/
                this.recorderInit();
            } else {
                this.audioContext.resume();
                this.connectWebSocket();
            }
        };
        // 停止录音
        recorderStop() {
            if (!(/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgen))) {
                // safari下suspend后再次resume录音内容将是空白，设置safari下不做suspend
                this.audioContext && this.audioContext.suspend();
            }
            this.setStatus('end');
            try {
                // this.streamRef.getTracks().map(track => track.stop()) || his.streamRef.getAudioTracks()[0].stop();
            } catch (error) {
                console.error('暂停失败!');
            }
        };
        // 开始
        start() {
            this.recorderStart();
            this.setResultText({ resultText: '', resultTextTemp: '' });
        };
        // 停止
        stop() {
            this.recorderStop();
        };
    };
}));