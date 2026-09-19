const CACHE_NAME = "walkie-talkie-v1";

const APP_FILES = [
    "./",
    "./index.html",
    "./login.html",
    "./register.html",
    "./style.css",
    "./app.js",
    "./firebase.js",
    "./manifest.json"
];


self.addEventListener("install", function(event) {

    event.waitUntil(

        caches.open(CACHE_NAME)
            .then(function(cache) {

                return cache.addAll(APP_FILES);

            })

    );

    self.skipWaiting();

});


self.addEventListener("activate", function(event) {

    event.waitUntil(

        caches.keys()
            .then(function(cacheNames) {

                return Promise.all(

                    cacheNames
                        .filter(function(name) {

                            return name !== CACHE_NAME;

                        })
                        .map(function(name) {

                            return caches.delete(name);

                        })

                );

            })

    );

    self.clients.claim();

});


self.addEventListener("fetch", function(event) {

    event.respondWith(

        fetch(event.request)
            .then(function(response) {

                return response;

            })
            .catch(function() {

                return caches.match(event.request);

            })

    );

});