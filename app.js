const { App } = require("@slack/bolt");
const modalGenerator = require("./views/modalGenerator");
const { google } = require("googleapis");
const auth = require("./utils/googleAuth");
const {
  parseModalInput,
  validateResults,
  buildSubmissionData,
  findTarget,
  buildGoogleCalendarEvent,
  generateVacationRequestModal,
  generateAllowDenyModal
} = require("./utils/dataProcessingFunctions");
require("dotenv").config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: parseInt(process.env.PORT) || 3000,
});

let mg = new modalGenerator();
let vacationRequestModal = generateVacationRequestModal();

const vacationSpreadsheetId = process.env.VACATION_SPREADSHEET;
const vacationSheet = process.env.VACATION_SHEET;
const vacationResultSpreadsheetId = process.env.VACATION_RESULT_SPREADSHEET;
const vacationResultSheet = process.env.VACATION_RESULT_SHEET;
const vacationCalendarId = process.env.VACATION_CALENDAR_ID;
const authorizer = process.env.AUTHORIZER;

app.command("/refresh", async ({ ack, body, client }) => {
  await ack();
  try {
    //show the vacation request modal
    await client.views.open({
      trigger_id: body.trigger_id,
      view: vacationRequestModal,
    });
  } catch (error) {
    console.error(error);
  }
});

app.view("vacation-request-modal", async ({ ack, body, view, client }) => {
  //take the submissions
  let submissions = parseModalInput(view);

  const googleClient = await auth.getClient();
  const googleSheets = google.sheets({ version: "v4", auth: googleClient });

  const getRows = (
    await googleSheets.spreadsheets.values.get({
      auth,
      spreadsheetId: vacationSpreadsheetId,
      range: vacationSheet,
    })
  ).data.values;

  let availableVacationDays = getRows
    .filter((row) => row[0] == body["user"]["username"])
    .map((row) => parseInt(row[1]))[0];
  let errors = validateResults(submissions, availableVacationDays);

  if (Object.values(errors).includes(true)) {
    await ack({
      response_action: "errors",
      errors: {
        vacationStart: errors["startInThePast"]
          ? "???????????? ????????? ????????????"
          : "",
        vacationType: errors["notEnoughVacation"]
          ? "?????? ????????? ???????????????"
          : "",
        vacationEnd: errors["negativeLength"]
          ? "???????????? ??????????????? ?????? ????????????"
          : "",
        otherVacationReason: errors["notHaveOtherReason"]
          ? "?????? ????????? ?????????????????????"
          : "",
      },
    });
  } else {
    await ack();
    let allowDenyModal = generateAllowDenyModal(submissions, body["user"]);

    try {
      await client.chat.postMessage({
        channel: authorizer,
        blocks: allowDenyModal["blocks"],
        text: "-",
      });
    } catch (error) {
      console.error(error);
    }
  }
});

app.action(/((allow|deny)-vacation-button)/, async ({ ack, body, client }) => {
  await ack();
  let authorizer = `${body["user"]["name"]}, (${body["user"]["username"]})`;
  let vacationRequestResult =
    body["actions"][0]["value"] == "allow-vacation" ? "??????" : "?????????";
  let rawVacationRequest = body["message"]["blocks"];
  let vacationRequesterId = rawVacationRequest[2]["block_id"];
  let epochResultTime = body["actions"][0]["action_ts"];
  let resultTime = new Date(0);
  resultTime.setUTCSeconds(epochResultTime);
  resultTime = resultTime.toISOString().split("T")[0];

  const googleClient = await auth.getClient();
  const googleSheets = google.sheets({ version: "v4", auth: googleClient });
  const googleCalendar = google.calendar({ version: "v3", auth: googleClient });

  let rawData = buildSubmissionData(rawVacationRequest); //send this to google sheets and calendar

  let finalData = {
    ?????????: authorizer,
    "??????/??????": vacationRequestResult,
    "??????/????????????": resultTime,
    ...rawData,
  };

  let vacationString = `${finalData["?????????"]} ~ ${finalData["?????????"]} ${finalData["?????? ??????"]}(${finalData["?????? ??????"]})`;

  try {
    await client.chat.postMessage({
      channel: vacationRequesterId,
      text: (vacationRequestResult =
        vacationString +
        (vacationRequestResult == "??????"
          ? "??? ?????????????????????"
          : "??? ????????? ???????????????")),
    });

    await googleSheets.spreadsheets.values.append({
      auth,
      spreadsheetId: vacationResultSpreadsheetId,
      range: vacationResultSheet,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [Object.values(finalData)],
      },
    });

    if (finalData["??????/??????"]=="??????") {
      const getRows = (
        await googleSheets.spreadsheets.values.get({
          auth,
          spreadsheetId: vacationSpreadsheetId,
          range: vacationSheet,
        })
      ).data.values;
      
      let target = findTarget(getRows, "B", finalData);
  
      await googleSheets.spreadsheets.values.update({
        auth,
        spreadsheetId: vacationSpreadsheetId,
        range: vacationSheet.concat("!", target[0]),
        valueInputOption: "USER_ENTERED",
        resource: {
          values: [target[1]],
        },
      });
  
      let event = buildGoogleCalendarEvent(finalData);
      await googleCalendar.events.insert({
        auth,
        calendarId: vacationCalendarId,
        resource: event,
      });
    }

  } catch (error) {
    console.error(error);
  }
});

(async () => {
  // Start your app
  await app.start(parseInt(process.env.PORT) || 3000);

  console.log("Bolt app is running!");
})();
