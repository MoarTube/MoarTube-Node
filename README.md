# MoarTube-Node
A repository containing the node software for the [MoarTube platform](http://www.moartube.com).

## Setup Guide (Ubuntu Linux) (automated)

Run the command **bash <(wget -O - https://www.moartube.com/bash/install/node)**

Your MoarTube node is now ready! :tada:

## Setup Guide (Ubuntu Linux) (manual)

Run the command **sudo snap install node --classic --channel=20**

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
