const GetLocalFile =  async (type) => {
    const processZip = async (zip) => {
        var promises = Object.keys(zip.files)
                            .filter(path => path.endsWith(".jpg") || path.endsWith(".png") || path.endsWith(".jpeg"))
                            .map(name => zip.files[name])
                            .map(file => file.async("base64"));
        return await Promise.all(promises);
    }

    
    GetLocalFileProcess(async data => {
        var zip = new JSZip();
        var images = await zip.loadAsync(data).then(processZip);
        var buildMessage = (body) => type + "|" + body;
        var message = "";
        if(type == 2) {
            message = buildMessage(JSON.stringify({
                Slides : images,
                Index : 0
            }));
        } else {
            console.log("not supported");
            alert("import media of this type is not yet supported");
            return;
        }
        WebglInstance.SendMessage("GameManager", "HandleFile", message);
    });
}

const GetLocalFileProcess = async (callBack) => {
    var input = document.createElement('input');
    input.type = 'file';
    var byteData;
    input.onchange = e => { 
        var file = e.target.files[0]; 
        var reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = readerEvent => {
            byteData = readerEvent.target.result;
            callBack(byteData);
        }
    }
    input.click();
}


const handleFile = (fileData, metadata) => {
    var file = JSON.parse(fileData);
    // upload file to server and get url
    var url = "https://dummy.url.for.file.upload";
    // send([localUser], { Source   : handlers.Browser /* Browser */,
    //                     Action   : actions.File,
    //                     Body     : url,
    //                     SenderId : localUser });  

}
