/*-------------------------------------------------------------------------------------
	Ruskeths Amazing
		Twitch TMI - Node JS Module
		Rusketh aka MarcusWithSpots - 2019-2021
--------------------------------------------------------------------------------------
	
Copyright 2018-2020 C Goluch

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

--------------------------------------------------------------------------------------

	Usage: 
			var bot = new TMIBot()
			
			bot.on('connect' () => {
				bot.join("rusketh");
			});

			bot.on('joinchannel' () => {
				bot.say("rusketh", "Hello World!");
			});

			bot.connect( { username: "", oauth: "" } );

--------------------------------------------------------------------------------------
	TMI Bot
		
		TMIBot extends EventEmitter

		new TMIBot({			|	Creates a new TMI IRC client.
			string host,		| 	Overwrites the IRC address, defaults to twitch irc servers.
			string port 		| 	Overwrites the IRC port, defaults to twitch irc servers.
		})

		TMIBot.connect({		|	Connects the IRC client to the server.
			string username,	|	IRC User name
			string oauth,		|	IRC oauth password
			bool tags,			|	Request tag information in messages, defaults to true.
			bool names,			|	Request names information in messages, defaults to true.
			bool membership,	|	Request membership information in messages, defaults to true.
			bool commands,		|	Request commands information in messages, defaults to true.
		})

		TMIBot.say(				|	Posts a message in a chat room.
			string channel,		|	The name of the chat room.
			string message 		|	The message.
		)

		TMIBot.whisper(			|	Sends a wispher to a user in a chat room.
			string channel,		|	The name of the chat room.
			string username,	|	The name of the user room.
			string message 		|	The message.
		)

		TMIBot.join( 			|	Joins a chat room.
			string channel 		|	The name of the chat room.
		)

		TMIBot.leave( 			| 	Leaves a chat room.
			string channel 		|	The name of the chat room.
		)

		TMIBot.close()			|	Closes the IRC connection to the server.

		TMIBot.reconnect()		|	Closes the IRC connection to the server and reconnects.

--------------------------------------------------------------------------------------
	Packets:

		When IRC data comes in it will be converted to a packet and pushed to the relevant event.
		
		packet.message_id						|	The id of this message packet.
		packet.rawdata							|	The raw data of this packet.
		packet.username							|	The username of who sent this packet.
		packet.packet							|	The type of the packet e.g JOIN, PART, PRIVMSG, etc...
		packet.channel							|	The channel this packet was sent via.
		packet.message							|	The message contents of the packet.
		packet.action							|	If the message is a /me command then the action is here.
		packet.tags 							|	If this packet has tags they will be here.
		packet.rawtags							|	This is the raw data used to create the tags.
		packet.badges 							|	Array of badge ids.
		packet.emotes 							|	Array of emote data.
		packet.broadcaster						|	True if the sending user is the broascaster.
		packet.moderator						| 	True if the sending user is a moderator.
		packet.admin							|	True if the sending user is the broascaster or is a moderator.
		packet.subscriber 						|	True if the sending user is currently subscribed to the channel this packet was sent in.
		packet.subscription 					|	0 - 3 returns the sending users is subscription tier to the channel this packet was sent in.
		packet.userid 							|	
		packet.user								|	
		packet.months_subscribed				|	
		packet.months_subscribe_streak			|	
		packet.announce_subscribe_streak		|	
		packet.recipient_userid					|	
		packet.recipient_username				|	
		packet.raider_username					|	
		packet.raider							|	
		packet.viewers							|	
		packet.promotion_total					|	
		packet.promotion_name					|	
		packet.subscription_tier				|	
		packet.subscription_name				|	
		packet.ritual_name						|	
		packet.bit_threshold					|	
		packet.bits								|	
		packet.hex_color						|	

--------------------------------------------------------------------------------------
	Events:
		disconnect			|	Called when the connection is closed.
		error				|	Called when an error has occured.
		data				|	Called when data is recieved before the packet is handled.
		unhandledline		|	Called when recieved data can not be handled as a packet.
		unhandledpacket		|	Called when recieved data has been parsed into a packet but not handled.	
		joinchannel			|	Called when a channel has been joined by the bot.
		userjoin			|	Called when a user joins a channel.
		leavechannel		|	Called when a channel ahs been left by the bot.
		userleave			|	Called when a player leaves a channel.
		action				|	Called when a player uses a /me command in chat.
		chat				|	Called when a player says somthing in chat.
		whisper				|	Called when a player spispers to the bot.
		notice				|	
		reconect			|	Called when twitch whants you to reconnect.
		raid				|	
		unraid				|	
		sub					|	
		resub				|	
		subgift				|	Called 
		usernotice			|	Called on a usernotice packet.

--------------------------------------------------------------------------------------
	Constants
--------------------------------------------------------------------------------------*/

const tls = require('tls');
const assert = require('assert');
const EventEmitter = require('events').EventEmitter;

const ack_prefix = ":tmi.twitch.tv CAP * ACK :";
const nak_prefix = ":tmi.twitch.tv CAP * NAK :";

const notice_pattern1 = /:(.+) ([A-Z]+) #([a-zA-Z0-9_]+) (:(.+)*)/;
const notice_pattern2 = /:(.+) ([A-Z]+) #([a-zA-Z0-9_]+)/;

const action_pattern = /\u0001ACTION (.+)\u0001/;
const message_pattern = /:([a-zA-Z0-9_]+)!(.+) ([A-Z]+) #([a-zA-Z0-9_]+) (:(.+)*)/;
const whisper_pattern = /:([a-zA-Z0-9_]+)!(.+) ([A-Z]+) ([a-zA-Z0-9_]+) (:(.+)*)/;
const packet_pattern = /:([a-zA-Z0-9_]+)!(.+) ([A-Z]+) #([a-zA-Z0-9_]+)/;

const prefix_pattern = /@(.+) :/;
const keyvalues_pattern = /([^;.]+)=([^;.]+)/g;
const key_value_pattern = /(.+)=(.+)/;
const num_pattern = /^([0-9]+)$/;

/*--------------------------------------------------------------------------------------
TMIBOT Library
--------------------------------------------------------------------------------------*/
const TMIBot = class TMIBot extends EventEmitter {

	constructor( {host = 'irc.chat.twitch.tv', port = 443} = {} ) {
		super();

		try {
			assert(port);
			assert(host);
		} catch ( err ) {
			throw new Error('Missing connection arguments.')
		}

		this.host = host;
		this.port = port;
		this.socket = new tls.TLSSocket();

		this.tags = false;
		this.names = false;
		this.membership = false;
		this.commands = false;

		this.channels = {};
	}

	connect( {username, oauth, tags = true, names = true, membership = true, commands = true} ) {

		try {
			assert(username);
			assert(oauth);
		} catch ( err ) {
			throw new Error('Missing login arguments.')
		}

		this.nick = username;
		this.oauth = oauth;

		this.sub_tags = tags;
		this.sub_names = names;
		this.sub_membership = membership;
		this.sub_commands = commands;

		this.socket.connect( {host: this.host, port: this.port} );

		this.socket.setEncoding('utf8');

		this.socket.once('connect', () => {
			this.performlogin();
		});

		this.socket.on('end', () => {
			this.emit('disconnect');
		});

		this.socket.on('error', err => function( err ) {
			this.emit('error', err);
		});

		this.socket.on('data', data => {
			this.parsedata(data);
		});

		return this;
	}

	reconnect() {
		if (!this.socket) return;

		this.socket.destroy();

		this.socket = new tls.TLSSocket();

		this.connect({username: this.nick, oauth: this.oauth, tags: this.sub_tags, names: this.sub_names, membership: this.sub_membership, commands: this.sub_commands});
	}

	performlogin() {

		this.write('PASS ' + this.oauth);
		this.write('NICK ' + this.nick);

		if (this.sub_tags) this.write("CAP REQ :twitch.tv/tags");
		if (this.sub_names) this.write("CAP REQ :twitch.tv/names");
		if (this.sub_membership) this.write("CAP REQ :twitch.tv/membership");
		if (this.sub_commands) this.write("CAP REQ :twitch.tv/commands");

		this.emit('connect');

		for (let channel in this.channels) {
			this.join(channel);
		}
	}

	parsedata(data) {

		var lines = data.split("\r\n");

		for (let i in lines) {

			let line = lines[i];

			this.emit("data", line);

			if ( !this.parseline(line) )
				this.emit("unhandledline", line);
		}
	}

	parseline(line) {
		
		if ( line == null || line == "" )
			return;

		if ( line.includes("PING :tmi.twitch.tv") ) {
			this.write('PONG :tmi.twitch.tv');
			return true;
		}

		if (line.startsWith(ack_prefix)) {
			return this.enroll(line.substring(ack_prefix.length, line.length), true);
		}

		if (line.startsWith(nak_prefix)) {
			return this.enroll(line.substring(ack_prefix.length, line.length), false);
		}
		
		var parsed = this.matchline(line);

		if (!parsed)
			return false;

		if ( !this.handlepacket(parsed) )
			this.emit("unhandledpacket", line);
		else
			this.emit("packet", parsed);

		return true;
	}

	enroll(type, value) {
		if (type == "")
			return false;

		if ( type == "twitch.tv/membership" )
			this.tags = value;

		if ( type == "twitch.tv/tags" )
			this.names = value;

		if ( type == "twitch.tv/commands" )
			this.membership = value;

		if ( type == "twitch.tv/names" )
			this.commands = value;

		this.emit('enroll', {type: type, value: value});

		return true;
	}

	matchline(line) {

		var parsed;
		var matches = line.match(whisper_pattern);

		if (matches == null)
			matches = line.match(message_pattern);

		if (matches == null)
			matches = line.match(packet_pattern);

		if (matches != null)
			parsed = {
				rawdata: line,
				username: matches[1],
				packet: matches[3],
				channel: matches[4],
				message: matches[6]
			};

		if (matches == null)
			matches = line.match(notice_pattern1);

		if (matches == null)
			matches = line.match(notice_pattern2);

		if (matches != null && parsed == null)
			parsed = {
				rawdata: line,
				username: null,
				packet: matches[2],
				channel: matches[3],
				message: matches[6]
			};

		if (parsed != null)
			this.parsetags(parsed);

		return parsed;
	}

	parsebadges(parsed) {
		if (!parsed.tags) return;

		parsed.badges = {};

		let badgetag = parsed.tags.badges;
 
		if (!badgetag) return;

		let matches = badgetag.match(/([a-zA-Z]+)\/([0-9]+)/g);

		if (!matches) return;

		for(let i = 0; i < matches.length; i++) {

			let match = matches[i].match(/([a-zA-Z]+)\/([0-9]+)/);

			if (!match) continue;

			let badge = match[1];

			parsed.badges[ match[1] ] = parseInt(match[2]);

		}

		parsed.broadcaster = parsed.badges.broadcaster;
		
		parsed.moderator = parsed.badges.moderator;

		parsed.admin = parsed.broadcaster || parsed.moderator;

	}

	parseemotes(parsed) {
		if (!parsed.tags) return;

		parsed.emotes = [];

		let emotetag = parsed.tags.emotes;
 
		if (!emotetag) return;

		let matches = emotetag.match(/([0-9]+):([0-9]+)-([0-9]+)/g);

		if (!matches) return;

		for(let i = 0; i < matches.length; i++) {

			let match = matches[i].match(/([0-9]+):([0-9]+)-([0-9]+)/);

			if (!match) continue;

			let emote = { };
			emote.id = match[1];
			emote.start = parseInt(match[2]);
			emote.end = parseInt(match[3]);

			parsed.emotes.push(emote);
		}

	}

	parsetags(parsed) {
		var match = parsed.rawdata.match(prefix_pattern);
		if (match == null) return;

		parsed.tags = {};
		parsed.rawtags = match[1];

		var matches = parsed.rawtags.match(keyvalues_pattern);
		if (matches == null) return;

		for (let i in matches) {
			let keyvalue = matches[i];
			if (!keyvalue) continue;

			let key_values = keyvalue.match(key_value_pattern);
			if (!key_values) continue;

			let key = key_values[1];
			let value = key_values[2];

			if ( value.match(num_pattern) ) {
				value = parseInt(value, 10) || 0;
			}

			parsed.tags[key] = value;
		}

		parsed.subscription = parsed.tags.subscriber || 0;
		
		parsed.subscriber = parsed.subscription > 0;

		this.parsebadges(parsed);

		this.parseemotes(parsed);
	}

	handel_usernotice(parsed) {

		if (parsed.tags) {

			var msg = parsed.tags["msg-id"];

			parsed.message_id = parsed.tags["id"];
			parsed.message = parsed.tags["message"];

			parsed.username = parsed.tags["login"];
			parsed.userid = parsed.tags["user-id"];
			parsed.user = parsed.tags["display-name"];

			if (msg == "sub" || msg == "resub") {
				parsed.months_subscribed = parsed.tags["msg-param-cumulative-months"];
				parsed.months_subscribe_streak = parsed.tags["msg-param-streak-months"];
				parsed.announce_subscribe_streak = parsed.tags["msg-param-should-share-streak"] == 1;
			}

			if (msg == "subgift" || msg == "anonsubgift") {
				parsed.months_subscribed = parsed.tags["msg-param-months"];
				parsed.recipient = parsed.tags["msg-param-recipient-display-name"];
				parsed.recipient_userid = parsed.tags["msg-param-recipient-id"];
				parsed.recipient_username = parsed.tags["msg-param-recipient-user-name"];
			}

			if (msg == "raid" || msg == "unraid") {
				parsed.raider_username = parsed.tags["msg-param-login"];
				parsed.raider = parsed.tags["msg-param-displayName"];
			}

			if (msg == "raid") {
				parsed.viewers = parsed.tags["msg-param-viewerCount"];
			}

			if (msg == "giftpaidupgrade") {
				parsed.username = parsed.tags["msg-param-sender-login"];
				parsed.user = parsed.tags["msg-param-sender-name"];
			}

			if (msg == "anongiftpaidupgrade" || msg == "giftpaidupgrade") {
				parsed.promotion_total = parsed.tags["msg-param-promo-gift-total"];
				parsed.promotion_name = parsed.tags["msg-param-promo-name"];
			}

			if (msg == "sub" ||msg == " resub" ||msg == " subgift" ||msg == " anonsubgift") {
				var teir = parsed.tags["msg-param-sub-plan"];
				
				if (teir == 1000) {
					teir = 1;
				} else if (teir == 2000) {
					teir = 2;
				} else if (teir == 3000) {
					teir = 3;
				} else {
					teir = 0;
				}

				parsed.subscription_tier = teir;
				parsed.subscription_name = parsed.tags["msg-param-sub-plan-name"];
			}

			if (msg == "ritual") {
				parsed.ritual_name = parsed.tags["msg-param-ritual-name"];
			}

			if (msg == "bitsbadgetier") {
				parsed.bit_threshold = parsed.tags["msg-param-threshold"];
			}

			if (msg == "sub" || msg == "resub" || msg == "subgift" || msg == "anonsubgift" || msg == "raid" || msg == "unraid" || msg == "giftpaidupgrade" || msg == "anongiftpaidupgrade" || msg == "bitsbadgetier" || msg == "ritual") {
				this.emit(msg, parsed);

				return true;
			}

		}

		this.emit("usernotice", parsed);

		return true;
	}

	handlepacket(parsed) {
		//check if the packet is a follow event

		if (parsed.packet == "JOIN") {
			if (parsed.username == this.nick) {
				this.channels[parsed.channel] = true;

				this.emit("joinchannel", parsed);

			} else {
				this.emit("userjoin", parsed);
			}

			return true;
		}

		if (parsed.packet == "PART") {
			if (parsed.username == this.nick) {
				this.channels[parsed.channel] = null;

				this.emit("leavechannel", parsed);
			} else {
				this.emit("userleave", parsed);
			}

			return true;
		}

		if (parsed.packet == "PRIVMSG") {

			if (parsed.tags) {
				parsed.message_id = parsed.tags["id"];
				parsed.bits = parsed.tags["bits"];
				parsed.hex_color = parsed.tags["color"];
				parsed.user = parsed.tags["display-name"];
				parsed.userid = parsed.tags["user-id"];
			}

			var matches = parsed.message.match(action_pattern);

			if (matches) {
				parsed.message = matches[1];

				this.emit("action", parsed);

				return true;
			}

			this.emit("chat", parsed);

			return true;
		}

		if (parsed.packet == "WHISPER") {

			if (parsed.channel == this.nick) {
				this.emit("whisper", parsed);

				return true;
			}

		}

		if (parsed.tags && parsed.tags["msg-id"] == "followed_channel") {
			this.emit("follower", parsed);
			return true;
		}

		if (parsed.packet == "NOTICE") {
			this.emit("notice", parsed);

			return true;
		}

		if (parsed.packet == "RECONNECT") {
			this.reconnect();
			
			this.emit("recconect", parsed);

			return true;
		}

		if (parsed.packet == "USERNOTICE") {
			
			return this.handel_usernotice(parsed);

		}

		return false;
	}

	write(line) {
		this.socket.write(line + '\r\n');
	}

	say(channel, message) {
		this.write('PRIVMSG #' + channel + ' :' + message);
	}

	whisper(channel, user, message) {
		this.write('PRIVMSG #' + (channel || this.nick) + ' :/w ' + user + " " + message);
	}

	join(channel) {
		this.write("JOIN #" + channel);
	}

	leave(channel) {
		this.write("PART #" + channel);
	}

	close() {
		this.socket.destroy();

		this.emit('close');
	}
};



module.exports = TMIBot;