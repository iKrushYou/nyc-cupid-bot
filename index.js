const axios = require('axios')
const {DateTime} = require("luxon");

const args = require('minimist')(process.argv.slice(2));

const website_url = "https://clerkscheduler.cityofnewyork.us/s/MarriageCeremony"

const api_url = "https://clerkscheduler.cityofnewyork.us/s/sfsites/aura?r=10&aura.ApexAction.execute=1"
const headers = {
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
}

function generateData(selectedDate) {
    return `message=%7B%22actions%22%3A%5B%7B%22id%22%3A%2289%3Ba%22%2C%22descriptor%22%3A%22aura%3A%2F%2FApexActionController%2FACTION%24execute%22%2C%22callingDescriptor%22%3A%22UNKNOWN%22%2C%22params%22%3A%7B%22namespace%22%3A%22%22%2C%22classname%22%3A%22SCHED_BookAppointmentController%22%2C%22method%22%3A%22getSlots%22%2C%22params%22%3A%7B%22isDeviceMobile%22%3Afalse%2C%22isCeremonyFlow%22%3Atrue%2C%22isLicenseFlow%22%3Afalse%2C%22isDomesticFlow%22%3Afalse%2C%22isCertificateOfNonImpediment%22%3Afalse%2C%22isRecordsRoom%22%3Afalse%2C%22isMarriageOfficiantRegistration%22%3Afalse%2C%22isPageLoad%22%3Afalse%2C%22isDateChanged%22%3Atrue%2C%22isWeekChanged%22%3Afalse%2C%22locationId%22%3A%220013d000003HJArAAO%22%2C%22selectedDate%22%3A%22${selectedDate}%22%2C%22selectedSlotId%22%3Anull%2C%22selectedSlotData%22%3A%22null%22%7D%2C%22cacheable%22%3Afalse%2C%22isContinuation%22%3Afalse%7D%7D%5D%7D&aura.context=%7B%22mode%22%3A%22PROD%22%2C%22fwuid%22%3A%222yRFfs4WfGnFrNGn9C_dGg%22%2C%22app%22%3A%22siteforce%3AcommunityApp%22%2C%22loaded%22%3A%7B%22APPLICATION%40markup%3A%2F%2Fsiteforce%3AcommunityApp%22%3A%22KbCmDBVbE10iCy1inwbbzA%22%2C%22COMPONENT%40markup%3A%2F%2Finstrumentation%3Ao11yCoreCollector%22%3A%22kA6gW5EadEh9qZBKZj4IqQ%22%7D%2C%22dn%22%3A%5B%5D%2C%22globals%22%3A%7B%7D%2C%22uad%22%3Afalse%7D&aura.pageURI=%2Fs%2FMarriageCeremony&aura.token=null`
}

async function getMaxDate() {
    const response = (await axios.post(api_url, generateData('2022-06-23'), {headers})).data
    return response.actions[0].returnValue.returnValue.maxDate;
}

async function fetchTimeSlots() {
    const maxDate = await getMaxDate();
    const response = (await axios.post(api_url, generateData(maxDate), {headers})).data

    const slotsAvailable = [];

    console.log(JSON.stringify(response, null, 2))

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

async function sendSlackMessage({text, blocks}) {
    const slackKey = args['slack-key']
    if (!slackKey) throw new Error('missing argument slackKey');

    const slackWebhook = `https://hooks.slack.com/services/TGR8XBMAS/B03BF1M5TU5/${slackKey}`;

    const method = 'POST';
    try {
        const response = await axios({method, url: slackWebhook, data: {text, blocks}})
    } catch (e) {
        console.log({e})
    }
}

async function sendTimeSlotMessage(slots) {
    const datesMap = {};
    for (const slot of slots) {
        const dt = DateTime.fromISO(slot.startDateTime).setZone('America/New_York')
        const date = dt.toFormat("ccc, LLL d y") //dt.toLocaleString(DateTime.DATE_FULL)
        if (!datesMap[date]) {
            datesMap[date] = []
        }
        datesMap[date].push(dt.toLocaleString(DateTime.TIME_SIMPLE))
    }
    let text = "";
    const blocks = [];
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
    if (Object.entries(datesMap).length === 0) {
        text = "No Appointments"
        blocks.push({
            type: "header",
            text: {
                type: "plain_text",
                text: `No Appointments`
            }
        })
    }
    for (const [dateHeader, dates] of Object.entries(datesMap)) {
        blocks.push({
            type: "header",
            text: {
                type: "plain_text",
                text: `${dateHeader} (${dates.length})`
            }
        })
        text += `${dateHeader} (${dates.length}) `
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

    console.log(JSON.stringify({text, blocks}, null, 2))
    await sendSlackMessage({text, blocks})
}

async function fetchMarriageLicenseTimes() {
    const url = `https://projectcupid.cityofnewyork.us/fbu/uapi/services/incus5-scheduler/execute`
    const body = {
        "url": "scheduler/availability",
        "params": {
            "eventId": "25bcc807-747d-458c-9d2f-955184ca7087",
            "month": "05",
            "year": "2022",
            "timezone": "America/New_York"
        },
        "headers": {},
        "requestType": "get",
        "options": {},
        "componentKey": "plugGetAvailabilty",
        "formTitle": "Cupid: Couple License Portal",
        "submissionId": "6269dc80bcbe01c798a00e73",
        "formId": "5ea78be89a184422c4691bf8",
        "body": {}
    }
    const headers = {
        Cookie: `UQK-AUTH-USER=%7B%22exp%22%3A1651119759%7D; UQK-AUTH-XSRF=nESsbmml-s1j_VtS-vg5-xBRymz9tdkLiLrI; unqorkioToken=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7Il9pZCI6IjcydnIxanVnIiwiYXV0aE1ldGhvZCI6InJlZmVyIiwiaXAiOiI5Ni4yMzIuMTU2LjIxNiIsImlzRGVzaWduZXJVc2VyIjpmYWxzZSwic2Vzc2lvbklkIjoiMTlmYmUxOTAtNzMyZC00MzQ4LThhNWYtNzIyYTc4MzhmNGJkIiwicmVmcmVzaEV4cCI6MTY1MTE5MTQzNjQwMSwiX2NzcmYiOiJrRmVKSDNselVHUWUwakM1M3hSYXBCWXUiLCJleHAiOjE2NTExMTk3NjR9LCJleHAiOjE2NTExMTk3NjQsImlhdCI6MTY1MTEwNTM2NH0.P2qTkT75cFdYZAYsPXFtMqHhn0rV5Z17kBDKOapmnY3m4yDAnsNThE5vveoI3DvU9Iqa011i14SSptIWXP6bajOlFpIyOW20YZuGl2fIcRH7Jtnp95q2Rxkv0j4yyb650zzC9m9aeKXL90IQbO5x26T0v6tfEHHV9KJbgU93x03uPECOSy3T_jzR8XXjsV5irE8vhQ3h3BtApr6p3rGb7VuOMklLL4PU4uFG_NCmoG-cTVnmFHY6WywqRMZwN-4y4bH_NssS7g67ChOnXDyhCmK41AjC29kifxQyEHS9sTMU-SxQJQrLTIUVVLg31zLN7kbzUX5fk7eORQX2XV848Q; _ga=GA1.2.1585731898.1651104579; _gat_UA-160844363-1=1; _gid=GA1.2.43213515.1651104579`,
        'X-XSRF-TOKEN': 'nESsbmml-s1j_VtS-vg5-xBRymz9tdkLiLrI',
        'Content-Type': 'application/json;charset=utf-8',
        'Accept': 'application/json, text/plain, */*',
    }
    const response = await axios.post(url, body, {headers});

    const reqDt = DateTime.fromISO(`${body.params.year}-${body.params.month}`).setZone('America/New_York')
    const reqDateString = reqDt.toFormat('LLLL, y');

    console.log(JSON.stringify(response.data, null, 2))

    const availabilityTimeslots = response?.data?.availabilityTimeslots;

    const totalAppointments = availabilityTimeslots.reduce((sum, timeslot) => sum + timeslot.slots.length, 0);

    const dates = availabilityTimeslots
        .filter(timeslot => timeslot.slots.length > 0)
        .map(timeslot => `${DateTime.fromISO(timeslot.eventDate).setZone('America/New_York').toLocaleString(DateTime.DATETIME_FULL)} (${timeslot.slots.length})`)
        .sort((a, b) => a.localeCompare(b))

    const text = `Marriage License Appointments for ${reqDateString} (${totalAppointments})`
    const blocks = []

    blocks.push({
        type: "divider"
    })
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: `*Marriage License Appointments*\nfor ${reqDateString} (${totalAppointments})`
        }
    })
    if (dates.length > 0) {
        dates.forEach(date => {
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: date
                }
            })
        })
    } else {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `No appointments across ${availabilityTimeslots.length} dates.`
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
            "url": 'https://projectcupid.cityofnewyork.us/app/cupid#/display/5ea78be89a184422c4691bf8/6269dc80bcbe01c798a00e73/5ea21661a46ab1020e166d0c',
            "action_id": "button-action"
        }
    })

    console.log(JSON.stringify({text, blocks}, null, 2))
    await sendSlackMessage({text, blocks})
}

fetchTimeSlots()
    .catch(err => {
        console.error('Error retrieving slots', err)
    })

fetchMarriageLicenseTimes()
    .catch(err => {
        console.error('Error retrieving slots', err)
    })