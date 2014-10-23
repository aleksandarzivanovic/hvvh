var fs = require('fs');
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var argv = require('optimist').argv;
global.path = require("path");
var async = require('async');

var cookieParser = require('cookie-parser');
var multipart = require('connect-multiparty');
var morgan = require('morgan');
var compression = require('compression');

var docroot = argv.root || __dirname;

var phpcgi = require('node-phpcgi')({
    documentRoot: docroot,
    // change it to your own path
    handler: argv.php || 'php-cgi'
});



var htaccess = function(req, res, next) {



	if (req.url === '/') {
		if (fs.existsSync(docroot + '/index.php')) {
			req.url = req.url + 'index.php';
		} else {
			req.url = req.url + 'index.html';
		}
	}
	var p = req.url.split('?')[0];
	var url = req.url;
	while (p !== '/') {

		p = path.dirname(p);
		if (fs.existsSync(docroot + '/' + p + '/.htaccess')) {
			var htaccess = fs.readFileSync(docroot + '/' + p + '/.htaccess','utf8').split("\n");
			var lastLine = ['','','',''];
			var rewriteCondMatch = true;

			for (var i = 0; i < htaccess.length; i++) {
				var line = htaccess[i].trim().replace(/\\ /g, 'ESCAPE_BACKSLASH').split(' ');

				if (line[0].indexOf('#') === 0) {
					//comment
				} else if (line[0] === 'SetEnv') {
					//phpCGI.env[line[1]] = line[2];
				} else if (line[0] === 'RewriteCond') {
					line[2] = line[2].replace('ESCAPE_BACKSLASH', "\\ ");

					var cond = '';
					var matched = false;
					switch (line[1]) {
						case '%{REQUEST_FILENAME}':
							cond = docroot + '/' + req.url;

							if (line[2] === '!-f' || line[2] === '!-d') {
								if (!fs.existsSync(cond.split('?')[0])) {
									matched = true;
								} else {
									matched = false;
								}
							}
							break;
						case '%{HTTP_HOST}':
							cond = req.headers.host;
							matched = (cond.search(new RegExp(line[2])) > -1);
							break;
						case '%{HTTP_USER_AGENT}':
							cond = req.headers['user-agent'];
							matched = (cond.search(new RegExp(line[2])) > -1);
							break;
						case '%{REQUEST_URI}':
							cond = req.url;
							matched = (cond.search(new RegExp(line[2])) > -1);
							break;
						case '%{HTTP_COOKIE}':
							cond = JSON.stringify(req.cookies);
							matched = (cond.search(new RegExp(line[2])) > -1);
							break;
						case '%{REQUEST_METHOD}':
							cond = req.method;
							matched = (cond.search(new RegExp(line[2])) > -1);
							break;
					}

					if (lastLine[0] !== 'RewriteCond') {
						rewriteCondMatch = null;
					}
					if (typeof lastLine[3] !== 'undefined' && lastLine[3] === '[OR]') {
						if (!rewriteCondMatch) {
							rewriteCondMatch = matched;
						} else {
							rewriteCondMatch = rewriteCondMatch || matched;
						}
					} else if (typeof lastLine[3] === 'undefined' || lastLine[3] !== '[OR]') {
						if (!rewriteCondMatch) {
							rewriteCondMatch = matched;
						} else {
							rewriteCondMatch = rewriteCondMatch && matched;
						}
					}
				} else if (line[0] === 'RewriteRule') {
					var brk = false,
						redirect = 0,
						modifiers = '';
					if (rewriteCondMatch) {
						if (line[3]) {
							var modifier = line[3].replace('[','').replace(']','').split(',');
							if (modifier.indexOf('L') > -1) {
								brk = true;
							}
							if (modifier.indexOf('NC') > -1) {
								modifiers += 'i';
							}
							if (modifier.indexOf('R=301') > -1) {
								redirect = 301;
							}
						}
						url = req.url;
						if (url.indexOf('/') === 0) {
							url = url.replace('/', '');
						}

						var match = url.match(new RegExp(line[1], modifiers));

						if (match !== null) {
							url = url.replace(new RegExp(line[1], modifiers), line[2]);
							if (redirect) {
								res.redirect(redirect, url);
								return;
							}
							if (url.indexOf('/') !== 0) {
								url = '/' + url;
							}

							if (brk) {
								break;
							}

						}
					}
				}
				lastLine = line;
			}

			break;
		}
	}
	req.url = url;
	if (req.url.lastIndexOf('/') === req.url.length - 1) {
		if (fs.existsSync(docroot + '/' + req.url + '/index.html')) {
			req.url = req.url + '/index.html';
		} else {
			req.url = req.url + '/index.php';
		}
	}
	next();
};

app.use(morgan());
app.use(compression());
app.use(multipart());
app.use(cookieParser());
app.use(htaccess);
app.use(phpcgi);
app.use(express.static(docroot, {maxAge: (Date.now()*1000) + 86400000, httpOnly: true}));

server.listen(argv.port || 8080);
