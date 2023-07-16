const jsonFormatter = require('./json-formatter');
const htmlFormatter = require('./html-formatter');
const { serve } = require('./webserver');
const { debug, route } = require('./config');

const { fs, Shell, Buffer } = require('filer');

/* global workbox */
// TODO: include this via package.json
importScripts('/assets/libs/workbox/workbox-sw.js');

workbox.setConfig({ debug, modulePathPrefix: "/assets/libs/workbox" });

// Route with trailing slash (i.e., /path/into/filesystem)
const wwwRegex = new RegExp(`${route}(/.*)`);
// Route minus the trailing slash
const wwwPartialRegex = new RegExp(`${route}$`);



workbox.routing.registerRoute(
  wwwRegex,
  ({ url }) => {
    // Pull the filesystem path off the url 
    let path = url.pathname.match(wwwRegex)[1];
    // Deal with encoding in the filename (e.g., spaces as %20)
    path = decodeURI(path);

    // Allow passing `?json` on URL to get back JSON vs. raw response
    const formatter =
      url.searchParams.get('json') !== null
        ? jsonFormatter
        : htmlFormatter;

    // Allow passing `?download` or `dl` to have the file downloaded vs. displayed
    const download =
      url.searchParams.get('download') !== null ||
      url.searchParams.get('dl') !== null;

    return serve(path, formatter, download);
  },
  'GET'
);

// Redirect if missing the / on our expected route
workbox.routing.registerRoute(
  wwwPartialRegex,
  ({ url }) => {
    url.pathname = `${route}/`;
    return Promise.resolve(Response.redirect(url, 302));
  },
  'GET'
);
function regCache() {
  workbox.routing.registerRoute(
    /.*/,
    ({ url }) => {
      if (url.pathname === "/") {
        url.pathname = "/index.html";
      }
      const basepath = "/anura_files";
      let sh = new fs.Shell();
      // this is more annoying than it needs to be because this uses an old-ass compiler which doesn't like promises
      let path = decodeURI(url.pathname);
      let localreq = serve(`${basepath}${path}`, htmlFormatter, false);
      return new Promise(resolve => {
        localreq.then(r => {
          if (r.ok) {
            resolve(r);
          } else {
            fetch(url).then(f => {
              resolve(f);
              if (f.ok) {
                let cl = f.clone();
                cl.arrayBuffer().then(b => {
                  sh.mkdirp(`${basepath}${path.replace(/[^/]*$/g, "")}`, () => {
                    fs.writeFile(`${basepath}${path}`, Buffer(b));
                  });
                });
              }
            }).catch(a => {
              console.error(`Could not fetch? ${a}`);
            });
          }
        });
      });
    },
    'GET'
  );
}
let done = false;
addEventListener("message", event => {
  if (event.data.value) {
    regCache();
  }
  if (done) return;
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      done = true;
      client.postMessage({ anura_target: "anura.settings.set", id: 1, prop: "use-sw-cache" });
    });
  });
});

workbox.core.skipWaiting();
workbox.core.clientsClaim();
