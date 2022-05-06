const subdomain = 'demo'; // Replace with your custom subdomain
var avatarURL = "";
var buildReady = false;
var WebglInstance;

const ReadyPlayerMeProxy = document.getElementById('readyPLayerMeHolder');
var unity_container = document.querySelector("#unity-container");
var avatar_container = document.querySelector("#avatar-Container");
var canvas = document.querySelector("#unity-canvas");
var warningBanner = document.querySelector("#unity-warning");

function WaitSyncBuildReadyStatus() {
    while(!buildReady);
}

function SetupReadyPlayerMe() {
    function subscribe(event) {
        const json = parse(event);

        if (json?.source !== 'readyplayerme') {
            return;
        }

        // Susbribe to all events sent from Ready Player Me once frame is ready
        if (json.eventName === 'v1.frame.ready') {
            ReadyPlayerMeProxy.contentWindow.postMessage(
                JSON.stringify({
                target: 'readyplayerme',
                type: 'subscribe',
                eventName: 'v1.**'
                }),
                '*'
            );
        }

        // Get avatar GLB URL
        if (json.eventName === 'v1.avatar.exported') {
            avatarURL= json.data.url;
            // hide avatarContainer
            avatar_container.hidden = true;
            unity_container.hidden = false;
            WaitSyncBuildReadyStatus();
            WebglInstance.SendMessage("MenuManager", "SetUserAvatar", "external::" + avatarURL);
        }

        // Get user id
        if (json.eventName === 'v1.user.set') {
            console.log(`User with id ${json.data.id} set: ${JSON.stringify(json)}`);
        }
    }

    function parse(event) {
        try {
            return JSON.parse(event.data);
        } catch (error) {
            return null;
        }
    }

    ReadyPlayerMeProxy.src = `https://${subdomain}.readyplayer.me/avatar?frameApi`;
    window.addEventListener('message', subscribe);
    document.addEventListener('message', subscribe);
}

// Shows a temporary message banner/ribbon for a few seconds, or
// a permanent error message on top of the canvas if type=='error'.
// If type=='warning', a yellow highlight color is used.
// Modify or remove this function to customize the visually presented
// way that non-critical warnings and error messages are presented to the
// user.
function SetupUnityFrame() {
// unhide unity-container
    function unityShowBanner(msg, type) {
        function updateBannerVisibility() {
            warningBanner.style.display = warningBanner.children.length ? 'block' : 'none';
        }
        var div = document.createElement('div');
        div.innerHTML = msg;
        warningBanner.appendChild(div);
        if (type == 'error') div.style = 'background: red; padding: 10px;';
        else {
            if (type == 'warning') div.style = 'background: yellow; padding: 10px;';
            setTimeout(function() {
                warningBanner.removeChild(div);
                updateBannerVisibility();
            }, 5000);
        }
        updateBannerVisibility();
    }

    var buildUrl = "Build";
    var loaderUrl = buildUrl + "/webgl.loader.js";
    var config = {
        dataUrl: buildUrl + "/webgl.bin",
        frameworkUrl: buildUrl + "/webgl.framework.js",
        codeUrl: buildUrl + "/webgl.wasm",
        streamingAssetsUrl: "StreamingAssets",
        companyName: "Nethermind",
        productName: "Art-Verse",
        productVersion: "0.3",
        showBanner: unityShowBanner,
    };

    // By default Unity keeps WebGL canvas render target size matched with
    // the DOM size of the canvas element (scaled by window.devicePixelRatio)
    // Set this to false if you want to decouple this synchronization from
    // happening inside the engine, and you would instead like to size up
    // the canvas DOM size and WebGL render target sizes yourself.
    // config.matchWebGLToCanvasSize = false;

    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        unity_container.className = "unity-mobile";
        // Avoid draining fillrate performance on mobile devices,
        // and default/override low DPI mode on mobile browsers.
        config.devicePixelRatio = 1;
        unityShowBanner('WebGL builds are not supported on mobile devices.');
    } 

    var script = document.createElement("script");
    script.src = loaderUrl;
    script.onload = () => {
        createUnityInstance(canvas, config, null).then((unityInstance) => {
            WebglInstance = unityInstance;
            // wait for 10 seconds before showing the avatar
        }).catch((message) => {
            alert(message);
        });
    };
    document.body.appendChild(script);
}

SetupReadyPlayerMe();
SetupUnityFrame();
