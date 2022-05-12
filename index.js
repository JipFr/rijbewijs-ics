import prompt from "prompt";
import fetch from "node-fetch";
import ics from "ics";
import fs from "fs";

(async () => {
	const { username, password, school } = await prompt.get([
		"school",
		"username",
		"password",
	]);

	// Request authentication stuff
	const authUrl = "https://dashboard.dation.nl/oauth/v2/auth";
	const authReq = await fetch(authUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-user-type": "student",
		},
		body: JSON.stringify({
			username,
			password,
		}),
	});
	const authBody = await authReq.json();

	// Find user ID from auth body
	const jwt = authBody.id_token;
	const jwtPayload = jwt.split(".")[1];
	const jwtPayloadJSON = JSON.parse(
		Buffer.from(jwtPayload, "base64").toString("utf8")
	);
	const userId = jwtPayloadJSON.environments[0].environment_user_id;

	// Firebase shiz
	const firebaseUrl =
		"https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken?key=AIzaSyCGV_xlSH9BuRbJ3weSZUZQWPN-T42e1dU";
	const firebaseReq = await fetch(firebaseUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			token: authBody.custom_token,
			tenantId: "dashboard-ilv4k",
			returnSecureToken: true,
		}),
	});
	const firebaseBody = await firebaseReq.json();

	// Request appointments
	const appointmentsUrl = `https://dashboard.dation.nl/api/v1/students/${userId}/appointments`;
	const appointmentsReq = await fetch(appointmentsUrl, {
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${firebaseBody.idToken}`,
			"Cache-Control": "no-store",
			"X-Dation-Handle": "vanherpt",
		},
	});
	const appointmentsBody = await appointmentsReq.json();
	console.log(appointmentsBody);

	// Convert appointments to ICS
	const events = appointmentsBody.map((appointment) => {
		// Date stuff
		const start = new Date(appointment.start);
		const end = new Date(appointment.end);
		const dateStart = [
			start.getFullYear(),
			start.getMonth() + 1,
			start.getDate(),
			start.getHours(),
			start.getMinutes(),
		];
		const diffInMinutes = (end.getTime() - start.getTime()) / 60000;

		// Create title
		const title = [appointment.displayName];

		if (appointment.exam) title.unshift("[EXAMEN] ");
		if (appointment.externalComments)
			title.push(`: ${appointment.externalComments}`);

		return {
			title: title.join(""),
			duration: { minutes: diffInMinutes },
			start: dateStart,
			uid: `rijles-${appointment.id}`,
			alarms: [
				{
					action: "audio",
					description: "Reminder",
					trigger: { hours: 0, minutes: 30, before: true },
					repeat: 1,
					attachType: "VALUE=URI",
					attach: "Glass",
				},
				{
					action: "audio",
					description: "Reminder",
					trigger: { hours: 16, minutes: 0, before: true },
					repeat: 1,
					attachType: "VALUE=URI",
					attach: "Glass",
				},
			],
		};
	});

	console.log(events);

	const { value, error } = ics.createEvents(events);

	if (error) throw console.log(error);

	fs.writeFileSync("rijles.ics", value);
	console.log("Wrote to rijles.ics \n".repeat(50));
})();
