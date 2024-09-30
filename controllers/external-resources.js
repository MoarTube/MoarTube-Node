const express = require('express');
const path = require('path');
const fs = require('fs');

const { getPublicDirectoryPath, getDataDirectoryPath } = require('../utils/paths');

function javascript_GET() {
    return express.static(path.join(getPublicDirectoryPath(), 'javascript'));
}

function css_GET() {
    return express.static(path.join(getPublicDirectoryPath(), 'css'));
}

function fonts_GET() {
    return express.static(path.join(getPublicDirectoryPath(), 'fonts'));
}

function images1_GET(url) {
    const imageName = path.basename(url).replace('/', '');

    if(imageName === 'icon.png' || imageName === 'avatar.png' || imageName === 'banner.png') {
        const customImageDirectoryPath = path.join(path.join(getDataDirectoryPath(), 'images'), imageName);

        if(fs.existsSync(customImageDirectoryPath)) {
            const fileStream = fs.createReadStream(customImageDirectoryPath);

            return fileStream;
        }
        else {
            return null;
        }
    }
    else {
        return null;
    }
}

function images2_GET() {
    return express.static(path.join(getPublicDirectoryPath(), 'images'));
}

module.exports = {
    javascript_GET,
    css_GET,
    fonts_GET,
    images1_GET,
    images2_GET
};