const today = new Date();

exports.parseModalInput = function (view) {
  let result = Object.values(view.state.values);

  let submissions = {};

  for (let i = 0; i < result.length; i++) {
    let raw = result[i];
    let answer_type = Object.keys(raw)[0];
    let raw_answer = Object.values(raw[answer_type])[1];

    try {
      let answer =
        typeof raw_answer === "object" ? raw_answer["value"] : raw_answer;
      submissions[answer_type] = answer;
    } catch {
      let answer = "-";
      submissions[answer_type] = answer;
    }
  }

  submissions["vacationStart"] = new Date(submissions["vacationStart"]);
  submissions["vacationEnd"] = new Date(submissions["vacationEnd"]);

  if (submissions["vacationType"].includes("half")) {
    submissions["vacationEnd"] = submissions["vacationStart"];
  }

  return submissions;
};

exports.validateResults = function (submissions, availableVacationDays) {
  let startInThePast = submissions["vacationStart"] < today;

  let vacationLength = submissions["vacationType"].includes("half")
    ? 0.5
    : (submissions["vacationEnd"] - submissions["vacationStart"]) /
        (1000 * 60 * 60 * 24) +
      1;

  let notEnoughVacation = availableVacationDays - vacationLength < 0;

  let negativeLength = vacationLength < 0;

  let notHaveOtherReason =
    submissions["vacationReason"] == "other" &&
    submissions["otherVacationReason"] == "-";

  return {
    startInThePast: startInThePast,
    notEnoughVacation: notEnoughVacation,
    negativeLength: negativeLength,
    notHaveOtherReason: notHaveOtherReason,
    vacationLength: vacationLength,
  };
};

exports.translate = function (value) {
  let translations = {
    "full-day": "연가",
    "morning-half-day": "오전 반차",
    "afternoon-half-day": "오후 반차",
    sick: "병가",
    "congrats-and-condolences": "경조사",
    other: "기타",
  };

  return translations[value] || value;
};

exports.buildSubmissionData = function (rawData) {
  let submissionData = {};

  for (let i = 0; i < rawData.length; i++) {
    if (rawData[i]["type"] == "section") {
      let keyValue1 = rawData[i]["text"]["text"].split(":");
      let keyValue2 = keyValue1.map((x) => x.trim());
      submissionData[keyValue2[0]] = keyValue2[1];
    }
  }

  return submissionData;
};

exports.findTarget = function (data, targetColumn, finalData) {
  let rowNum;
  let row;

  let username = finalData["신청자"].split("(")[1].slice(0, -1);

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] == username) {
      rowNum = i + 1;
      row = data[i];
    }
  }

  let vacationLength = finalData["휴가 종류"].includes("반차")
    ? 0.5
    : (Date.parse(finalData["종료일"]) - Date.parse(finalData["시작일"])) /
        (1000 * 60 * 60 * 24) +
      1;

  let targetCell = targetColumn.concat(rowNum.toString());

  let remainingDays = (parseFloat(row[1]) - vacationLength).toString();

  return [targetCell, [remainingDays]];
};

exports.buildGoogleCalendarEvent = function (finalData) {
  let startDate = new Date(finalData["시작일"]);
  let endDate = new Date(finalData["종료일"]);

  endDate.setDate(endDate.getDate() + 1);

  return {
    summary: `${finalData["신청자"]} ${finalData["휴가 종류"]}`,
    description: finalData["휴가 사유"],
    start: {
      date: startDate.toISOString().split("T")[0],
      timeZone: "Asia/Seoul",
    },
    end: {
      date: endDate.toISOString().split("T")[0],
      timeZone: "Asia/Seoul",
    },
  };
};

exports.generateVacationRequestModal = function() {
  let vacationRequestModal = JSON.parse(
    fs.readFileSync("modals/vacationRequestModal.json")
  );

  const today = new Date().toISOString().split("T")[0];

  let blocks = vacationRequestModal["blocks"];

  for (let i = 0; i < blocks.length; i++) {
    if (
      blocks[i]["type"] === "input" &&
      blocks[i]["element"]["type"] == "datepicker"
    ) {
      blocks[i]["element"]["initial_date"] = today;
    }
  }
  return vacationRequestModal;
}

exports.generateAllowDenyModal = function(submissions, userData) {
  let allowDenyModal = JSON.parse(
    fs.readFileSync("modals/allowDenyModal.json")
  );

  let submissionInfo = {
    requester: `${userData["name"]} (${userData["username"]})`,
    ...submissions,
  };

  let blocks = allowDenyModal["blocks"];

  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]["type"] == "section") {
      let data = submissionInfo[blocks[i]["block_id"]];

      if (["vacationStart", "vacationEnd"].includes(blocks[i]["block_id"])) {
        data = data.toISOString().split("T")[0];
      }

      blocks[i]["text"]["text"] = blocks[i]["text"]["text"] + translate(data);
    }
  }

  blocks[2]["block_id"] = userData["id"]; //hide user id in the modal for later

  return allowDenyModal;
}