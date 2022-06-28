FileType = {
    Url : 1, Video : 2, Audio : 4, Image : 8, Object : 16, Text : 32, Presentation : 64, 
}

const GetLocalFile =  async (type) => {
    const processZip = async (zip) => {
        var promises = Object.keys(zip.files)
                            .filter(path => path.endsWith(".jpg") || path.endsWith(".png") || path.endsWith(".jpeg"))
                            .map(name => zip.files[name])
                            .map(file => file.async("base64"));
        return await Promise.all(promises);
    }

    
    GetLocalFileProcess(type, async (name, data) => {
        var fileObject = {
            Type : type,
            Id   : 0,
            Name : name,
            Data : "",
            Details : {
                ZoneId   : 0,
                SenderId : 0,
                Epoch    : 0
            }
        };
        switch (type) {
            case FileType.Presentation:
                var zip = new JSZip();
                var images = await zip.loadAsync(data).then(processZip);
                fileObject.Data = JSON.stringify({
                    Slides : images,
                    Index : 0
                })
                break;
            default:
                fileObject.Data = data.toString().split(',')[1] 
                break;
        }
        var param = URL.createObjectURL(new Blob([JSON.stringify(fileObject)], {type: "application/json"}));
        WebglInstance.SendMessage("GameManager", "HandleFileData", param);
    });
}

const GetLocalFileProcess = async (type, callBack) => {
    var input = document.createElement('input');
    var extensionFilter = "";
    switch (type) {
        case FileType.Text:
            extensionFilter = ".txt"
            break;
        case FileType.Video:
            extensionFilter = ".mp4"
            break;
        case FileType.Audio:
            extensionFilter = ".mp3"
            break;
        case FileType.Image:
            extensionFilter = ".jpg, .png"
            break;
        case FileType.Object:
            extensionFilter = ".glb"
            break;
        case FileType.Presentation:
            extensionFilter = ".zip"
            break;
        default:
            return;
    }
    input.type = 'file';
    input.accept = extensionFilter;
    input.onchange = e => { 
        var file = e.target.files[0]; 
        var reader = new FileReader();

        if(type == 2 || type == 4 || type == 8 || type == 16 || type == 32){
            reader.readAsDataURL(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
        
        reader.onload = readerEvent => {
            var byteData = readerEvent.target.result;
            callBack(file.name ,byteData);
        }
    }
    input.click();
}
