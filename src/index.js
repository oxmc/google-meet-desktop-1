/* Import node modules */
const { app, BrowserWindow, systemPreferences, session, Tray, Menu, ipcMain, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
const request = require("request");
const notifier = require('node-notifier');
const exec = require('child_process').exec;

/* Info about app */
var appdir = app.getAppPath();
var appname = app.getName();
var appversion = app.getVersion();
const config = require(`${appdir}/src/main/config.json`);

/* Import pi-camera if on raspberry pi */
var isPi = require('detect-rpi');
if (isPi()) {
  console.log('Running on Raspberry Pi, importing pi-cam module');
  const { StreamCamera, Codec } = require("pi-camera-connect");
  const StartStream = async () => {
    const streamCamera = new StreamCamera({ codec: Codec.H264 });
    const videoStream = streamCamera.createStream();
    const writeStream = fs.createWriteStream("video-stream.h264");
    // Pipe the video stream to our video file
    videoStream.pipe(writeStream);
    await streamCamera.startCapture();
    // We can also listen to data events as they arrive
    videoStream.on("data", data => console.log("New data", data));
    videoStream.on("end", data => console.log("Video stream has ended"));
    // Wait for 5 seconds
    await new Promise(resolve => setTimeout(() => resolve(), 5000));
    await streamCamera.stopCapture();
  };
  //StartStream();
} else {
  console.log("Not on raspberry pi, not importing pi-cam module");
};

/* Import custom functions */
require("./main/cpuinfo");
require("./main/shortcut");
const { createMainWindow } = require("./main/window");

async function notification(mode, arg1) {
  if (mode == "1") {
    notifier.notify({
        title: 'Update availible.',
        message: 'An update is availible, Downloading now....',
        icon: `${appdir}/src/renderer/assets/download.png`,
        sound: true,
        wait: true
    });
  } else if (mode == "2") {
    notifier.notify({
        title: 'Update downloaded.',
        message: 'An update has been downloaded, Restarting app...',
        icon: `${appdir}/src/renderer/assets/tray-small.png`,
        sound: true,
        wait: true
      },
      function (err, response2) {
        if (response2 == "activate") {
          console.log("An update has been downloaded.");
          app.quit();
        }
      }
    );
  } else if (mode == "3") {
    notifier.notify({
        title: 'Not connected.',
        message: `You are not connected to the internet, you can not use ${appname} without the internet.`,
        icon: `${appdir}/src/renderer/assets/warning.png`,
        sound: true,
        wait: true
      },
      function (err, response3) {
        if (response3 == "activate") {
          console.log("User clicked on no wifi notification.");
        }
      }
    );
  } else if (mode == "4") {
    notifier.notify({
        title: 'Error downloading.',
        message: `Unable to download latest update file: '${arg1}'`,
        icon: `${appdir}/src/renderer/assets/warning.png`,
        sound: true,
        wait: true
      },
      function (err, response4) {
        if (response4 == "activate") {
          console.log("User clicked on unable to download notification.");
        } else {
	        notifier.on('timeout', function (notifierObject, options) {
	          // Triggers if notification closes
	          console.log("User did not click on unable to download notification.");
	        });
        }
      }
    );
  } else if (mode == "5") {
    notifier.notify({
        title: 'Error extracting files.',
        message: 'There was an error extracting some files.',
        icon: `${appdir}/src/renderer/assets/warning.png`,
        sound: true,
        wait: true
      },
      function (err, response5) {
        if (response5 == "activate") {
          console.log("User clicked on unable to extract notification.");
        } else {
	        notifier.on('timeout', function (notifierObject, options) {
	          // Triggers if notification closes
	          console.log("User did not click on unable to extract notification.");
	        });
        }
      }
    );
  }
}

/* Functions */
function checkInternet(cb) {
    require('dns').lookup('google.com',function(err) {
        if (err && err.code == "ENOTFOUND") {
            cb(false);
        } else {
            cb(true);
        }
    })
}

/* Disable gpu and transparent visuals if not win32 or darwin */
if (process.platform !== "win32" && process.platform !== "darwin") {
  app.commandLine.appendSwitch("enable-transparent-visuals");
  app.commandLine.appendSwitch("disable-gpu");
  app.disableHardwareAcceleration();
}

/* Menu tray and about window */
var packageJson = require(`${appdir}/package.json`)/* Read package.json */
var contrib = require(`${appdir}/src/main/contributors.json`)/* Read contributors.json */
var repoLink = packageJson.repository.url
var appAuthor = packageJson.author.name
if (Array.isArray(contrib.contributors) && contrib.contributors.length) {
  var appContributors = [ appAuthor, ...contrib.contributors ]
  var stringContributors = appContributors.join(', ')
} else {
  var stringContributors = appAuthor
}
var appYear = '2021' /* The year since this app exists */
var currentYear = new Date().getFullYear()
/* Year format for copyright */
if (appYear == currentYear){
  var copyYear = appYear
} else {
  var copyYear = `${appYear}-${currentYear}`
}
/* Tray Menu */
const createTray = () => {
  var creditText = stringContributors
  var trayMenuTemplate = [
    { label: "Google-Meet-Desktop", enabled: false },
    { type: 'separator' },
	  { label: "Open source on github!", enabled: false},
    { type: 'separator' },
	  { label: 'About', role: 'about', click: function() { app.showAboutPanel();}},
	  { label: 'Quit', role: 'quit', click: function() { app.quit();}}
  ]
  tray = new Tray(`${appdir}/src/renderer/assets/tray-icon.png`)
  let trayMenu = Menu.buildFromTemplate(trayMenuTemplate)
  tray.setContextMenu(trayMenu)
  const aboutWindow = app.setAboutPanelOptions({
	  applicationName: appname,
	  iconPath: `${appdir}/src/renderer/assets/app.png`,
	  applicationVersion: 'Version: ' + appversion,
	  authors: appContributors,
	  website: repoLink,
	  credits: 'Credits: ' + creditText,
	  copyright: 'Copyright © ' + copyYear + ' ' + appAuthor
  })
  return aboutWindow
}

/* When app ready, check for internet, then ask for permison */
app.whenReady().then(async () => {
  /* Create main window and tray */
  createMainWindow();
  createTray();
  /* Check for internet */
  checkInternet(function(isConnected) {
    if (isConnected) {
      SplashWindow.webContents.on("did-finish-load", () => {
        /* Get latest version from GitHub */
        console.log("Initilize Updater:");
        request(config.github, function (error, response, body) {
          if (!error && response.statusCode == 200) {
            var verfile = JSON.parse(body);
            const verstring = JSON.stringify(verfile);
            const ver = verfile.version;
            const onlineversion = ver.replace(/"([^"]+)":/g, '$1:');
            console.log(`Online version: '${onlineversion}'`);
            console.log(`Local version: '${appversion}'`);
            /* If Online version is greater than local version, show update dialog */
            if (onlineversion > appversion) {
              mainWindow.close();
              console.log("\x1b[1m", "\x1b[31m", "Version is not up to date!", "\x1b[0m");
              SplashWindow.webContents.send('SplashWindow', 'Update')
            } else {
              console.log("\x1b[1m", "\x1b[32m", "Version is up to date!", "\x1b[0m");
              SplashWindow.webContents.send('SplashWindow', 'Latest')
            }
          } else if (!error && response.statusCode == 404) {
            console.log("\x1b[1m", "\x1b[31m", "Unable to check latest version from main server!\nIt may be because the server is down, moved, or does not exist.", "\x1b[0m");
            notification(4);
          };
        });
      });
      ipcMain.on('FromSplashWindow', function (event, arg) {
        //console.log(arg);
        if (arg == "Restart") {
          if (os.platform() == "win32") {
            execute(`${app.getPath('home')}/${appname}.exe`);
          } else if (os.platform() == "darwin") {
            execute(`open -a ${app.getPath('home')}/${appname}.app`);
          } else if (os.platform() == "linux") {
            execute(`chmod +x ${app.getPath('home')}/${appname}.appimage`);
            execute(`${app.getPath('home')}/${appname}.appimage`);
          };
        } else if (arg == "ShowMainWindow") {
          console.log("Loading complete");
          SplashWindow.close();
          mainWindow.show();
        }
      })
    } else {
      /* User not connected */
      console.log("\x1b[1m", "\x1b[31m", "ERROR: User is not connected to internet, showing NotConnectedNotification", "\x1b[0m");
      notification(3);
      SplashWindow.close();
      googleMeetView.webContents.loadFile(appdir + '/src/renderer/nowifi.html');
      mainWindow.show();
    }
  });
  /* Ask for permison on darwin */
  if (process.platform === "darwin") {
    if (systemPreferences.getMediaAccessStatus("camera") !== "granted") {
      await systemPreferences.askForMediaAccess("camera");
    }
    if (systemPreferences.getMediaAccessStatus("microphone") !== "granted") {
      await systemPreferences.askForMediaAccess("microphone");
    }
    if (systemPreferences.getMediaAccessStatus("screen") !== "granted") {
      hasPromptedForPermission();
      hasScreenCapturePermission();
    }
  };
});

/* If all windows are closed, quit app, exept if on darwin */
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

/* Create windows and tray */
app.on("activate", function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
    createTray();
  } else {
    global.mainWindow && global.mainWindow.focus();
  }
});
