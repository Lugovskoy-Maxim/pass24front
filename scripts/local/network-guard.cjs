"use strict";

// Applied only by the local launcher, before loading Nest or Next. This prevents
// the application's TCP clients (HTTP, fetch, SMTP, MySQL, MongoDB) from leaving
// the three dedicated local ports. It is not an OS sandbox for hostile code.
const net = require("node:net");
const dns = require("node:dns");
const dgram = require("node:dgram");
const allowedPorts = new Set([3300, 3400, 37017]);
const allowedHosts = new Set(["127.0.0.1", "::1", "localhost"]);
// Bind the unchanged production backend to loopback for this local copy.
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (args[0] && typeof args[0] === "object") args[0] = { ...args[0], host: "127.0.0.1" };
  else if (typeof args[1] === "string") args[1] = "127.0.0.1";
  else args.splice(1, 0, "127.0.0.1");
  return originalListen.apply(this, args);
};

function denied() {
  const error = new Error(
    "PASS_LOCAL_NETWORK_BLOCKED: only dedicated local services are allowed",
  );
  error.code = "PASS_LOCAL_NETWORK_BLOCKED";
  return error;
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  if (typeof options === "number") {
    options = {
      port: options,
      host: typeof args[1] === "string" ? args[1] : "localhost",
    };
  }
  if (
    !options ||
    typeof options !== "object" ||
    options.path ||
    !allowedHosts.has(options.host || "localhost") ||
    !allowedPorts.has(Number(options.port))
  ) {
    throw denied();
  }
  return originalConnect.apply(this, args);
};

const originalLookup = dns.lookup;
dns.lookup = function (hostname, ...args) {
  if (!allowedHosts.has(hostname)) throw denied();
  return originalLookup.call(this, hostname, ...args);
};
const originalPromisesLookup = dns.promises.lookup;
dns.promises.lookup = async function (hostname, ...args) {
  if (!allowedHosts.has(hostname)) throw denied();
  return originalPromisesLookup.call(this, hostname, ...args);
};
dgram.createSocket = function () {
  throw denied();
};
