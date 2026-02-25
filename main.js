const {app,BrowserWindow} = require('electron');

function createWindows(){
    const win = new BrowserWindow({
        width : 300,
        height:100,
        frame : false,
        transparent:true,
        alwaysOnTop:true,
        resizable:true,
        skipTaskbar:true,
    });
    win.loadFile('index.html');

}
app.whenReady().then(createWindows);