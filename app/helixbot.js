/*--------------------------------------------------------------------------------------
	Constants
--------------------------------------------------------------------------------------*/

const http = require("node:http");
const assert = require("node:assert");
const { resolve6 } = require("node:dns");
const EventEmitter = require("node:events").EventEmitter;

/*--------------------------------------------------------------------------------------
	HelixBot Library
--------------------------------------------------------------------------------------*/

const HelixBot = class HelixBot extends EventEmitter
{ 

    constructor ({host = "localhost", port = 9080, clientid = "", secret = "", bearer})
    {

        try {
			assert(secret);
			assert(clientid);
		} catch ( err ) {
			throw new Error('Missing api arguments.')
		}

        this.host = host;
        this.port = port;

        this.start();

        this.secret = secret;
        this.clientid = clientid;
    }

/*--------------------------------------------------------------------------------------
    Create a http server to listen for data
--------------------------------------------------------------------------------------*/
    start()
    {
        this.server = http.createServer(
            (req, res) => {
                this.requestHandler(req, res);
            }
        );

        this.server.listen(this.port, this.host,
            () => {
                this.emit('ready');

                setInterval(
                    () => {
                        this.validateBearerToken()
                        .then(
                            (result) => {
                                if (!result)
                                    this.requestBearerToken();
                            }
                        )
                        .catch(
                            (err) => {
                                this.emit('error', err);
                            }
                        );
                    }
                    , 1000 * 60 * 60
                );
            }
        );

        this.server.on('error',
            (err) => {
                this.emit('error', err);
            }
        );

        this.server.on('close',
            () => {
                this.emit('close');
            } 
        );
    }

/*--------------------------------------------------------------------------------------
    Call Hexit API
--------------------------------------------------------------------------------------*/

    callAPI ({host = "id.twitch.tv", port = 443, path, method = 'GET', headers = { }, body = null, auth = true, validate_response = true})
    {
        return new Promise(
            (resolve, reject) => {

                if (auth && !this.bearer)
                    return reject(new Error('Missing bearer token.'));

                headers = Object.assign(
                    headers,
                    {
                        "Content-Type": "application/json",
                    }
                );

                if (auth)
                {
                    headers.Authorization = `Bearer ${this.bearer}`;
                    headers["Client-ID"] = this.clientid;
                }

                const req = http.request(
                    {
                        host,
                        port,
                        path,
                        method,
                        headers
                    },

                    (res) => {
                        res.setEncoding('utf8');

                        let chunks = '';

                        res.on('data',
                            (chunk) => {
                                chunks += chunk;
                            }
                        );

                        res.on('error', reject);

                        res.on('end',
                            () => {
                                try
                                {
                                    let result = JSON.parse(chunks);

                                    if (validate_response && result.status !== 200)
                                        return reject(new Error(result.message));
                                        
                                    resolve(result);
                                }
                                catch (err)
                                {
                                    err.message = 'Error parsing response: ' + err.message;
                                    reject(err);
                                }
                            }
                        );
                    }
                );

                req.on('error', reject);

                req.end(body);
            }
        );
    }

/*--------------------------------------------------------------------------------------
	Get Twitch Bearer Token
--------------------------------------------------------------------------------------*/

    requestBearerToken ()
    {
        return new Promise(
            (resolve, reject) => {
                this.callAPI(
                    {
                        path: `/oauth2/token?client_id=${this.clientid}&client_secret=${this.secret}&grant_type=client_credentials`,
                        method: 'POST',
                    }
                )
                .then(
                    (data) => {
                        this.bearer = data.access_token;

                        this.emit('bearer', this.bearer);

                        resolve(this.bearer);
                    }
                )
                .catch(reject);
            }
        );
    }

/*--------------------------------------------------------------------------------------
	Validate Bearer Token
--------------------------------------------------------------------------------------*/

    validateBearerToken ()
    {
        return new Promise(
            (resolve, reject) => {

                if (!this.bearer)
                   return resolve(false);

                this.callAPI(
                    {
                        path: `/oauth2/validate`,
                        method: 'GET',
                        validate_response: false
                    }
                )
                .then(
                    (data) => {
                        if (data.status !== 200 && data.message !== "invalid access token")
                            return reject(data);

                        resolve(data.status === 200 ? data : false);
                    }
                )
                .catch(reject);
            }
        );
    }

/*--------------------------------------------------------------------------------------
    Subscribe to Helix Events
--------------------------------------------------------------------------------------*/

    subscribe ({topic, callback, lease_seconds = 864000})
    {
        return new Promise(
            (resolve, reject) => {

                this.callAPI(
                    {
                        path: `/helix/eventsub/subscriptions?hub.callback=${callback}&hub.mode=subscribe&hub.topic=${topic}&hub.lease_seconds=${lease_seconds}`,
                        method: 'POST'
                    }
                )
                .then(resolve)
                .catch(reject);
            }
        );
    }

/*--------------------------------------------------------------------------------------
    Unsubscribe from Helix Events
--------------------------------------------------------------------------------------*/

    unsubscribe ({topic, callback})
    {
        return new Promise(
            (resolve, reject) => {

                this.callAPI(
                    {
                        path: `/helix/eventsub/subscriptions?hub.callback=${callback}&hub.mode=unsubscribe&hub.topic=${topic}`,
                        method: 'POST'
                    }
                )
                .then(resolve)
                .catch(reject);
            }
        );
    }

/*--------------------------------------------------------------------------------------
    Get all subscriptions
--------------------------------------------------------------------------------------*/

    getSubscriptions ()
    {
        return new Promise(
            (resolve, reject) => {

                this.callAPI(
                    {
                        path: `/helix/eventsub/subscriptions`,
                        method: 'GET'
                    }
                )
                .then(resolve)
                .catch(reject);
            }
        );
    }

/*--------------------------------------------------------------------------------------
    Handel http requests
--------------------------------------------------------------------------------------*/

    requestHandler (req, res)
    {
        let chunks = '';

        req.on('data',
            (chunk) => {
                chunks += chunk;
            }
        );

        req.on('end',
            () => {
                try
                {
                    let data = JSON.parse(chunks);

                    this.emit('event', data);
                }
                catch (err)
                {
                    err.message = 'Error parsing response: ' + err.message;
                    this.emit('error', err);
                }
            }
        );

        res.end();
    }

/*--------------------------------------------------------------------------------------
    Close the server
--------------------------------------------------------------------------------------*/

    close ()
    {
        this.server.close();
    }
};
