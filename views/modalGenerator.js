const fs = require("fs");
const { translate } = require("../utils/dataProcessingFunctions");

class modalGenerator {
  constructor() {}

  generateVacationRequestModal() {
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

  generateAllowDenyModal(submissions, userData) {
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
}

module.exports = modalGenerator;
