const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
    keyfile:"./credentials/credentials.json",
    scopes:["https://www.googleapis.com/auth/spreadsheets","https://www.googleapis.com/auth/calendar"]
});

module.exports = auth;