/*****************************************************************
	Error Message
*****************************************************************/

	const fs = require("fs"); 


	const handleError = (where, err) => {
		console.log("Error was dumped to file!");
		console.log(where);
		console.log(err);
		
		fs.appendFile("../error.txt", where + "\n" + JSON.stringify(err) + "\n--------------------------------------------------------------\n", () => {} );
	};

	process.on('uncaughtException', (err) => {
		handleError("process.uncaughtException", err);
		process.exit(1);
	});

	const fromJson = (where, raw) => {
		try {
			return JSON.parse(raw);
		} catch (err) {
			handleError("Json Error - " + where, err);
		}
	};

/*****************************************************************
	Config
*****************************************************************/

	let config = { port: "2411", "irc-user": "", "irc-pass": "", "channel": "" };

	if (!fs.existsSync("../config.json")) {

		fs.writeFileSync("../config.json", JSON.stringify(config));

	} else {

		config = fromJson("config.json", fs.readFileSync("../config.json") );

	}

/*****************************************************************
	Notifications
*****************************************************************/

	let toasts = {
		subs: { icon: "train-conductor112.gif", lifetime: 5 },
		bits: {
			"100000": { icon: "bits-100000.gif", lifetime: 30 },
			"10000": { icon: "bits-10000.gif", lifetime: 15 },
			"5000": { icon: "bits-5000.gif", lifetime: 10 },
			"1000": { icon: "bits-1000.gif", lifetime: 7 },
			"100": { icon: "bits-100.gif", lifetime: 5 },
			"1": { icon: "bits-1.gif", lifetime: 3 },
		}
	};

	if (!fs.existsSync("../notifications.json")) {

		fs.writeFileSync("../notifications.json", JSON.stringify(toasts));

	} else {

		toasts = fromJson("notifications.json", fs.readFileSync("../notifications.json") );

	}

/*****************************************************************
	Filter
*****************************************************************/

	let filter = process.argv[2];

	if (!filter || filter == "") filter = false;

	if (filter) console.log(`Setting Filter - ${filter}`);

/*****************************************************************
	Create Express web server
*****************************************************************/
	
	const express = require("express");

	const http = require("http");

	const app = express();

	const server = http.Server(app);

/*****************************************************************
	Socket IO
*****************************************************************/

	const socketIO = require("socket.io");

	const io = socketIO( server );

	io.on("connection", 
		(soc) => {
			console.log("Browser Source Connected");
		}
	);

/*****************************************************************
	IRC Connection
*****************************************************************/
	
	const tmibot = require("./tmibot");

	const bot = new tmibot( );

	bot.on('connect',
		() => {
			console.log(`Connected to IRC`);

			bot.join(config.channel);
		}
	);

	bot.on("disconnect", 
		() => {
			console.log("Disconnected from IRC!");

			setInterval(() => {
				console.log("Reconnecting to IRC!");

				bot.reconnect();
			}, 1000);
		}
	);

	bot.on("error", 
		(err) => {
			console.log("Error from IRC!");
			handleError("IRC->onError", err);
		}
	);


	bot.on("joinchannel",
		(packet) => {
			console.log(`Joined IRC channel #${packet.channel}`);
		}
	);

	//whena a user follows alert chat
	bot.on("follower",
		(packet) => {
			console.log(`${packet.username} followed`);
		}
	);

/*****************************************************************
	Sound Files
*****************************************************************/
	
	if (!fs.existsSync("../audio")) fs.mkdirSync("../audio");
	
	app.use( "/audio", express.static("../audio") );


/*****************************************************************
	Images
*****************************************************************/
	
	if (!fs.existsSync("../images")) fs.mkdirSync("../images");
	
	app.use( "/images", express.static("../images") );

	const images = [];

	for (let file of fs.readdirSync("../images")) {
		images.push(file);
	}

	io.on("connection", 
		(soc) => {
			soc.emit("images", images);
		}
	);

/*****************************************************************
	Command Files
*****************************************************************/
	
	if (!fs.existsSync("../commands")) fs.mkdirSync("../commands");

	let commands = { };
	let all_commands = [ ];

	for (let file of fs.readdirSync("../commands")) {
		if (file.endsWith(".json")) {
			
			let cmd = fromJson(`commands/${file}`, fs.readFileSync(`../commands/${file}`) );

			if (!filter || (!cmd.filter || filter == cmd.filter)) {

				commands[ cmd.command ] = cmd;

				all_commands.push(cmd);

				if (cmd.alias) {
					for (let alias of cmd.alias) {
						commands[ alias ] = cmd;
					}
				}

				console.log(`Registered Command - ${cmd.command}`);
			}

		}
	}

/*****************************************************************
	Raid Files
*****************************************************************/
	
	if (!fs.existsSync("../raiders")) fs.mkdirSync("../raiders");

	let raiders = {  };
	let generic_raiders = [ ];

	for (let file of fs.readdirSync("../raiders")) {
		if (file.endsWith(".json")) {
			
			let cmd = fromJson(`raiders/${file}`, fs.readFileSync(`../raiders/${file}`) );

			if (!filter || (!cmd.filter || filter == cmd.filter)) {

				if (cmd.user) raiders[ cmd.user ] = cmd;
				if (cmd.default) generic_raiders.push(cmd);

				if (cmd.command && cmd.command != "") {
					commands[ cmd.command ] = cmd;

					if (cmd.alias) {
						for (let alias of cmd.alias) {
							commands[ alias ] = cmd;
						}
					}
				}
			}

			if (cmd.user) console.log(`Registered Raider - ${cmd.user}`);
			if (cmd.default) console.log(`Registered Default Raider - ${cmd.default}`);
		}
	}

/*****************************************************************
	Counters
*****************************************************************/
	
	if (!fs.existsSync("../counters")) fs.mkdirSync("../counters");

	const counters = { };
	
	for (let file of fs.readdirSync("../counters")) {
		if (file.endsWith(".json")) {
			
			let cmd = fromJson(`counters/${file}`, fs.readFileSync(`../counters/${file}`) );

			if (!filter || (!cmd.filter || filter == cmd.filter)) {

				cmd.value = 0;

				cmd.tiny = 0;

				counters[ cmd.command ] = cmd;

				if (cmd.alias) {
					for (let alias of cmd.alias) {
						counters[ alias ] = cmd;
					}
				}

				console.log(`Registered Counter - ${cmd.command}`);
			}

		}
	}

	if (fs.existsSync("../counters.json")) {


		let values = fromJson("counters.json", fs.readFileSync("../counters.json") );

		for (let k in values) {

			let counter = counters[k];

			if (counter) counter.value = values[k];
		}
	}

	const saveCounters = () => {
		
		let values = {};

		for (let k in counters) {
			values[k] = counters[k].value;
		}

		fs.writeFileSync("../counters.json", JSON.stringify(values));

	}
	
/*****************************************************************
	Web Page
*****************************************************************/
	
	const html_path = __dirname + "/index.html";

	app.get("/", (req, res) => { res.sendFile( html_path ); } );

/*****************************************************************
	Bits
*****************************************************************/
	
	if (toasts.bits) {

		const processBits = function(packet) {
			try {
				let bits = packet.bits;

				if (!bits || bits <= 0) return;

				let data;

				if (bits >= 100000) data = toasts.bits["100000"];
				
				if ( (!data) && bits >= 10000 ) data = toasts.bits["10000"];
				
				if ( (!data) && bits >= 5000 ) data = toasts.bits["5000"];
				
				if ( (!data) && bits >= 1000 ) data = toasts.bits["1000"];
				
				if ( (!data) && bits >= 100 ) data = toasts.bits["100"];
				
				if ( !data) data = toasts.bits["1"];

				if (data) {
					io.emit("counter", {
						icon: data.icon,
						audio: data.audio,
						subtitle: packet.username,
						text: bits,
						lifetime: data.lifetime || 10
					} );
				}
			} catch( err) {
				handleError("bot-processBits", err);
			}
		}

		bot.on("chat", processBits);

		bot.on("action", processBits);

		let bitssss = 2;

	}

/*****************************************************************
	Subs
*****************************************************************/
	
	if (toasts.subs) {

		const processSub = function(packet) {

			try {
				
				io.emit("toast", {
					icon: toasts.subs.icon,
					audio: toasts.subs.audio,
					lifetime: toasts.subs.lifetime || 10,
					text: packet.months_subscribed || 1,
					subtitle: packet.recipient || packet.username || "?",
				});

			} catch( err) {
				handleError("bot-processSub", err);
			}

		};
		
		bot.on("sub", processSub);
		bot.on("resub", processSub);
		bot.on("subgift", processSub);
		bot.on("anonsubgift", processSub);
		bot.on("giftpaidupgrade", processSub);
		bot.on("anongiftpaidupgrade", processSub);
	}

/*****************************************************************
	Foobar Magic

	Install Now playing simple,
	Save to ../foobar.txt on event every seconds, using UTF-8
	using the formated string:

{
"playing": $if(%isplaying%, true, false),
"paused": $if(%ispaused%, true, false),
"artist": "%artist%",
"title": "%title%",
"length": $if(%isplaying%, %length_seconds%, 0),
"time": $if(%isplaying%, %playback_time_seconds%, 0),
"remaining": $if(%isplaying%, %playback_time_remaining_seconds%, 0)
}

*****************************************************************/
	
	const foobar = (err, raw) => {

		if (err) {
			handleError("updateFoobar", err);
			return;
		}

		if (!raw || raw === "") return;

		try {

			let data = (raw != "not running") ? fromJson("foobar.txt", raw) : { };

			if (!data) return;

			if (!data.title || data.title == "" || data.title == "?") data.title = "Unknown Title";
			if (!data.artist || data.artist == "" || data.artist == "?") data.artist = "Unknown Artist";
			
			data.changed = (foobar.artist != data.artist || foobar.title != data.title);

			io.emit("foobar", data);

			if (data.changed) {
				console.log(`Foobar updated: Playing '${data.title}' by '${data.artist}'`);

				bot.say(config.channel, `Now Playing '${data.title}' by '${data.artist}'`);
			}

			foobar.playing = data.playing;
			foobar.paused = data.paused;
			foobar.artist = data.artist;
			foobar.title = data.title;
			foobar.length = data.length;
			foobar.time = data.time;
			foobar.remaining = data.remaining;

		} catch (err) {
			handleError("foobar", err);
		}
	};

 	foobar.poll = (exists) => {
		try {
			if (exists) fs.readFile("../foobar.txt", {encoding: 'utf-8'}, foobar);
		} catch(err) {
			handleError("foobar.poll", err);
		}
	};

	foobar.update = () => {
		try {
			fs.exists("../foobar.txt", foobar.poll);
		} catch(err) {
			handleError("foobar.update", err);
		}
	};

	setInterval(foobar.update, 1000);

/*****************************************************************
	Commands
*****************************************************************/
	
	const chatCommand = (packet, fst, args) => {
		let cmd = commands[fst];

		if (!cmd) return;

		console.log( `${packet.username} called ${fst}` );

		if (cmd instanceof Function) {

			cmd = cmd(packet, fst, args);

			if (cmd.result) return cmd.result;
		}

		if (!cmd) return;

		if (cmd.modonly && !packet.admin) return console.log("Rejected - Not mod!");

		if (cmd.subonly && !packet.subscriber) return console.log("Rejected - Not sub!");

		if (cmd.subonly && packet.subscription < cmd.subonly) return console.log(`Rejected - Not tier ${packet.subscription} mod!`);

		let now = Date.now();

		if (cmd.expire && cmd.expire > now) return console.log("Rejected - Cooldown!");

		if (cmd.cooldown) cmd.expire = now + ((cmd.lifetime || 30) * 1000) + (cmd.cooldown * 1000) + ((cmd.delay || 0) * 1000);

		if (cmd.message && cmd.message != "") bot.say(config.channel, cmd.message);

		io.emit("command", cmd);

		return true;
	};

	const setCommand = (packet, fst, args) => {

		if (packet.admin) {

			let name = args[0];
			
			if (name && name != "") {

				let value = args[1];
				let counter = counters[name];

				if (counter && value.match(/^([0-9]+)$/)) {

					value = parseInt(counter);

					counter.value = value;

					bot.say(config.channel, `Set value of ${name} to ${value}.`);

					saveCounters();

					return true;
				}

			}

		}

		return false;
	};

	const foobarCommand = (packet, fst, args) => {
		if (fst != "!playing") return false;

		console.log( `${packet.username} called ${fst}` );

		if (!foobar.playing) return true;

		let now = Date.now();

		if (foobarCommand.expire && foobarCommand.expire > now) return console.log("Rejected - Cooldown!");

		if (foobarCommand.cooldown) foobarCommand.expire = now + 30000;

		bot.say(config.channel, `Currently Playing: ${foobar.artist} - ${foobar.title}.`);

	};

	const counterCommand = (packet, fst, args) => {

		if (fst == "!set") return setCommand(packet, fst, args);

		let cmd = counters[fst];

		if (!cmd) return false;

		if (cmd.modonly && !packet.admin) return;

		if (cmd.subonly && !packet.subscriber) return;

		if (cmd.subonly && packet.subscription < cmd.subonly) return;

		let now = Date.now();

		if (cmd.expire && cmd.expire > now) return;

		if (cmd.cooldown) cmd.expire = now + ((cmd.lifetime || 30) * 1000) + (cmd.cooldown * 1000) + ((cmd.delay || 0) * 1000);
		
		cmd.text = cmd.value = cmd.value + 1;

		cmd.tiny = cmd.tiny + 1;

		if (cmd.message && cmd.message != "") {
			bot.say(config.channel, cmd.message.replace("%value%", cmd.value).replace("%tiny%", cmd.tiny));
		}

		io.emit("toast", cmd);

		saveCounters();

		return true;

	};

	const peformCommand = (packet, fst, args) => {
		if ( chatCommand(packet, fst, args) ) return;
				
		if ( counterCommand(packet, fst, args) ) return;

		if ( foobarCommand(packet, fst, args) ) return;
	};

	bot.on("chat",
		(packet) => {

			try {
				let args = packet.message.toLowerCase().split(" ");
			
				let fst = args.splice(0, 1)[0];

				return peformCommand(packet, fst, args);

			} catch( err) {
				handleError("bot-onChat", err);
			}

		}
	);

/*****************************************************************
	Raiding
*****************************************************************/
	
	const randomRaid = (viewers) => {
		let options = [ ];

		for (let cmd of generic_raiders) {

			console.log( `checking ${cmd} - ${viewers} / ${cmd.viewers}` );

			if (cmd.viewers >= viewers) continue;

			if (cmd.expire && cmd.expire < Date.now()) continue;

			options.push(cmd);
		}

		if (options.length == 0) return;

		return options[ Math.floor(Math.random() * options.length) ] || options[0];
	};

	const performRaid = (username = "raider", viewers = 1) => {
		let cmd = raiders[ username ];

		console.log( `Raid from ${username} with ${viewers} viewers` );

		if (!cmd) cmd = randomRaid(viewers);

		if (!cmd) return;

		let now = Date.now();

		if (cmd.expire && cmd.expire > now) return;

		if (cmd.cooldown) cmd.expire = now + (cmd.cooldown * 1000) + ((cmd.delay || 0) * 1000);

		if (cmd.message && cmd.message != "") bot.say(config.channel, cmd.message.replace("%username%", username).replace("%viewers%", viewers));

		io.emit("command", Object.assign(cmd, { username, viewers }));
	};

	bot.on("raid", 
		(packet) => {
			try{
				performRaid(packet.raider_username, packet.viewers);
			} catch( err) {
				handleError("bot-onRaid", err);
			}
		}
	);

	commands["!raid"] = function(packet, fst, args) {

		if (packet.admin) performRaid(args[0], args[1]);

		return { result: true };
	};

	
/*****************************************************************
	Regulations Command
*****************************************************************/

	commands["!regulations"] = function(packet, fst, args) {

		if (packet.admin) {
			
			let regulations = [ ];

			for (let cmd of all_commands)
				if (cmd.type == "regulation" && cmd.brief) regulations.push(cmd);
			
			regulations.sort( (a, b) => {return a.command > b.command} );

			for (let cmd of regulations) {

				bot.say(config.channel, cmd.brief);

				console.log(cmd.brief);
			}
		}

		return { result: true };
	};

/*****************************************************************
	Start Everything
*****************************************************************/
	
	server.listen(config.port,
		() => {
			console.log(`Webserver started - http://localhost:${config.port}`);
		}
	);

	console.log("Connecting to IRC as " + config["irc-user"]);

	bot.connect( { username: config["irc-user"], oauth: config["irc-pass"] } );

/*****************************************************************
	Allow commands to be sent from cmdline window
*****************************************************************/

	const stdin = process.openStdin();

	stdin.addListener("data",
		(d) => {
			try {
				let cmd = d.toString().trim();

				let args = cmd.split(" ");

				let fst = args.splice(0, 1)[0];
				
				peformCommand({ username: "cmdline", admin: true }, fst, args);
			} catch( err) {
				handleError("stdin", err);
			}
		}
	);
