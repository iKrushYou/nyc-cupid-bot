const axios = require('axios')
const {DateTime} = require("luxon");

const args = require('minimist')(process.argv.slice(2));

const website_url = "https://clerkscheduler.cityofnewyork.us/s/MarriageCeremony"

const api_url = "https://clerkscheduler.cityofnewyork.us/s/sfsites/aura?r=10&aura.ApexAction.execute=1"
const headers = {
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
}
const data = "message=%7B%22actions%22%3A%5B%7B%22id%22%3A%2289%3Ba%22%2C%22descriptor%22%3A%22aura%3A%2F%2FApexActionController%2FACTION%24execute%22%2C%22callingDescriptor%22%3A%22UNKNOWN%22%2C%22params%22%3A%7B%22namespace%22%3A%22%22%2C%22classname%22%3A%22SCHED_BookAppointmentController%22%2C%22method%22%3A%22getSlots%22%2C%22params%22%3A%7B%22isDeviceMobile%22%3Afalse%2C%22isCeremonyFlow%22%3Atrue%2C%22isLicenseFlow%22%3Afalse%2C%22isDomesticFlow%22%3Afalse%2C%22isCertificateOfNonImpediment%22%3Afalse%2C%22isRecordsRoom%22%3Afalse%2C%22isMarriageOfficiantRegistration%22%3Afalse%2C%22isPageLoad%22%3Afalse%2C%22isDateChanged%22%3Atrue%2C%22isWeekChanged%22%3Afalse%2C%22locationId%22%3A%220013d000003HJArAAO%22%2C%22selectedDate%22%3A%222022-05-04%22%2C%22selectedSlotId%22%3Anull%2C%22selectedSlotData%22%3A%22null%22%7D%2C%22cacheable%22%3Afalse%2C%22isContinuation%22%3Afalse%7D%7D%5D%7D&aura.context=%7B%22mode%22%3A%22PROD%22%2C%22fwuid%22%3A%22nj61v-uP3bGswhb-VTdr6Q%22%2C%22app%22%3A%22siteforce%3AcommunityApp%22%2C%22loaded%22%3A%7B%22APPLICATION%40markup%3A%2F%2Fsiteforce%3AcommunityApp%22%3A%22KbCmDBVbE10iCy1inwbbzA%22%2C%22COMPONENT%40markup%3A%2F%2Finstrumentation%3Ao11yCoreCollector%22%3A%22kA6gW5EadEh9qZBKZj4IqQ%22%7D%2C%22dn%22%3A%5B%5D%2C%22globals%22%3A%7B%7D%2C%22uad%22%3Afalse%7D&aura.pageURI=%2Fs%2FMarriageCeremony&aura.token=null"

let complete = false

async function fetchTimeSlots() {
    const response = (await axios.post(api_url, data, {headers})).data

    const slotsAvailable = [];

    for (const action of response.actions) {
        if (action?.returnValue?.returnValue?.daySlotsColumns) {
            for (const daySlots of action.returnValue.returnValue.daySlotsColumns) {
                if (daySlots.slots && daySlots.slots.length > 0) {
                    slotsAvailable.push(...daySlots.slots)
                }
            }
        }
    }

    // for (const slot of slotsAvailable) {
    //     const dt = DateTime.fromISO(slot.startDateTime)
    //     console.log(dt.toLocaleString(DateTime.DATETIME_FULL))
    //     sendSlackMessage(dt.toLocaleString(DateTime.DATETIME_FULL))
    // }
    console.log(JSON.stringify(slotsAvailable, null, 2))
    await sendTimeSlotMessage(slotsAvailable)
}

async function sendSlackMessage({blocks}) {
    const slackKey = args['slack-key']
    if (!slackKey) throw new Error('missing argument slackKey');

    const slackWebhook = `https://hooks.slack.com/services/TGR8XBMAS/B03BF1M5TU5/${slackKey}`;

    const method = 'POST';
    try {
        const response = await axios({method, url: slackWebhook, data: {blocks}})
    } catch (e) {
        console.log({e})
    }
}

async function sendTimeSlotMessage(slots) {
    const datesMap = {};
    for (const slot of slots) {
        const dt = DateTime.fromISO(slot.startDateTime)
        const date = dt.toLocaleString(DateTime.DATE_FULL)
        if (!datesMap[date]) {
            datesMap[date] = []
        }
        datesMap[date].push(dt.toLocaleString(DateTime.TIME_SIMPLE))
    }
    const blocks = []
    blocks.push({
        type: "divider"
    })
    const headerText = `Status as of: ${DateTime.now().setZone('America/New_York').toLocaleString(DateTime.DATETIME_FULL)}`
    blocks.push({
        type: "section",
        text: {
            type: "plain_text",
            text: headerText
        }
    })
    for (const [dateHeader, dates] of Object.entries(datesMap)) {
        blocks.push({
            type: "header",
            text: {
                type: "plain_text",
                text: `${dateHeader} (${dates.length})`
            }
        })
        blocks.push({
            type: "section",
            text: {
                type: "plain_text",
                text: `${dates.join(", ")}`
            }
        })
    }

    // add link to website
    blocks.push({
        "type": "section",
        "text": {
            "type": "mrkdwn",
            "text": "Book an appointment"
        },
        "accessory": {
            "type": "button",
            "text": {
                "type": "plain_text",
                "text": "NYC Cupid",
                "emoji": true
            },
            "value": "click_me_123",
            "url": website_url,
            "action_id": "button-action"
        }
    })

    console.log(JSON.stringify({blocks}, null, 2))
    await sendSlackMessage({blocks})
}

fetchTimeSlots()
    .then(() => complete = true)
    .catch(err => {
        console.error('Error retrieving slots', err)
    })
