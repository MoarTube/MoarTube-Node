# MoarTube-Node
A repository containing the [MoarTube](https://www.moartube.com) node software. Get involved with the MoarTube platform by having your node share its videos or do your own thing and run your node privately. The software makes video and live streaming so easy you'll be amazed beyond belief.

# Features
 - Cross platform support for Windows/macOS/Linux
 - Video on demand (VoD) and HLS live streaming
 - **HLS** *(H.264, AAC)*, **MP4** *(H.264, AAC)*, **WEBM** *(VP9, Opus)*, **OGV** *(VP8, Opus)* container formats
 - Transcode static MP4/WEBM video to HLS/MP4/WEBM/OGV
 - Transcode RTMP Live stream (such as from OBS) to HLS live stream
 - Video output resolutions, 30fps: 2160p, 1440p, 1080p, 720p, 480p, 360p, 240p
 - No server-side encoding; client-side only
 - HTTPS/WSS
 - GPU acceleration for Nvidia and AMD (Windows only)
 - Admin panel for managing videos and live streams
 - Discussion section and live stream chat
 - Dark mode option and browser appearance configuration recognition
 - Reports section for comments and videos
 - Comment monitoring overview with moderation functionality
 - Captcha functionality to limit abuse
 - Run in the cloud or on your home WiFi
 - Publicize your node on [MoarTube](http://www.moartube.com), or run your node privately

## How to Get Started
MoarTube Node can be found on [DockerHub](https://hub.docker.com/r/moartube/moartube-node) and can be managed with software like [Docker Desktop](https://www.docker.com/products/docker-desktop/), or follow the manual approach to set up your node. After that, head over to [MoarTube Client](https://github.com/cconley717/MoarTube-Client) if you haven't already.

The default login credentials for your node are below. Be sure to change these upon logging in.

**username**: admin

**password**: admin

# Manual Approach

## (Ubuntu Linux, Digital Ocean) (automated)

Run the command ***bash <(wget -O - https://www.moartube.com/bash/install/node)***

Your MoarTube node is now ready! :tada:

## (Ubuntu Linux, Digital Ocean) (manual)

Run the command **sudo snap install node --classic --channel=21**

**git clone** the MoarTube-Node repository

Open a terminal within the MoarTube-Node directory

Run the command **npm install**

Run the command **node node.js**

### Ubuntu Autostart Guide (easy)

Open a terminal within the MoarTube-Node directory

Stop the Moartube Node software if it is running

Run the command **npm install pm2 -g**

Run the command **pm2 start node.js**

#### pm2 Commands That You Might Need

pm2 list

pm2 stop node

pm2 restart node

pm2 delete node

### Ubuntu Autostart Guide (advanced)

Stop the Moartube Node software if it is running

Run the command **sudo nano /etc/systemd/system/moartube-node.service**

Below is an example of a moartube-node systemd service unit file

Make any necessary changes and paste it into the nano text editor

```
[Unit]
Description=MoarTube Node
After=network.target

[Service]
Type=simple
User=root
ExecStart=/snap/bin/node /home/Moartube-Node/node.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Run the command **sudo systemctl daemon-reload** to reload all services

Run the command **sudo systemctl enable moartube-node** to make the moartube-node service autostart on system boot

Run the command **sudo systemctl start moartube-node** to start the moartube-node service

Run the command **sudo systemctl status moartube-node** to view the status of the moartube-node service
