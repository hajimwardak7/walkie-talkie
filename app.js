/* =====================================================
   WALKIE TALKIE - MAIN APP
===================================================== */


import {
    app,
    db
} from "./firebase.js";


import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";


import {
    collection,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    onSnapshot,
    updateDoc,
    addDoc,
    query,
    where,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


/* =====================================================
   AUTH
===================================================== */

const auth =
    getAuth(app);


let firebaseUser = null;

let appStarted = false;


/* =====================================================
   ELEMENTS
===================================================== */

const micButton =
    document.getElementById("micButton");

const micText =
    document.getElementById("micText");

const channelName =
    document.getElementById("channelName");

const userCount =
    document.getElementById("userCount");

const channelsBox =
    document.getElementById("channelsBox");

const remoteAudio =
    document.getElementById("remoteAudio");

const callButton =
    document.getElementById("callButton");

const createChannelButton =
    document.getElementById("createChannelButton");

const showChannelsButton =
    document.getElementById("showChannelsButton");

const languageButton =
    document.getElementById("languageButton");


/* =====================================================
   USER
===================================================== */

let userId = null;


/* =====================================================
   CHANNEL
===================================================== */

let currentChannel =
    localStorage.getItem(
        "currentWalkieChannel"
    ) || "Afghanistan-1";


if (channelName) {

    channelName.innerText =
        currentChannel;

}


/* =====================================================
   VARIABLES
===================================================== */

let userDocumentRef = null;

let stopUsersListener = null;

let stopChannelsListener = null;

let stopIncomingCalls = null;

let stopCallListener = null;

let stopRemoteCandidates = null;

let peerConnection = null;

let localStream = null;

let currentCallId = null;

let currentRole = null;

let remoteCandidateQueue = [];

let isMicPressed = false;

let activeCallIds = new Set();


/* =====================================================
   WEBRTC CONFIG
===================================================== */

const rtcConfiguration = {

    iceServers: [

        {
            urls:
                "stun:stun.l.google.com:19302"
        },

        {
            urls:
                "stun:stun1.l.google.com:19302"
        }

    ]

};


/* =====================================================
   MICROPHONE
===================================================== */

async function getMicrophone() {

    try {

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {

            alert(
                "🎙️ ستاسې براوزر د مایکروفون ملاتړ نه کوي."
            );

            return null;

        }


        localStream =
            await navigator
                .mediaDevices
                .getUserMedia({

                    audio: {

                        echoCancellation: true,

                        noiseSuppression: true,

                        autoGainControl: true

                    },

                    video: false

                });


        console.log(
            "🎙️ Microphone ready"
        );


        const tracks =
            localStream.getAudioTracks();


        tracks.forEach(
            function(track) {

                track.enabled =
                    false;

            }
        );


        return localStream;


    } catch (error) {

        console.error(
            "Microphone error:",
            error
        );


        if (
            error.name ===
            "NotAllowedError"
        ) {

            alert(
                "🎙️ مهرباني وکړئ د مایکروفون اجازه ورکړئ."
            );

        } else {

            alert(
                "🎙️ مایکروفون فعال نه شو."
            );

        }


        return null;

    }

}


/* =====================================================
   CREATE PEER CONNECTION
===================================================== */

async function createPeerConnection(
    callRef,
    role
) {

    if (peerConnection) {

        return peerConnection;

    }


    currentRole =
        role;


    peerConnection =
        new RTCPeerConnection(
            rtcConfiguration
        );


    /* -----------------------------------------------
       MICROPHONE
    ------------------------------------------------ */

    if (!localStream) {

        localStream =
            await getMicrophone();

    }


    if (localStream) {

        localStream
            .getTracks()
            .forEach(
                function(track) {

                    peerConnection.addTrack(
                        track,
                        localStream
                    );

                }
            );

    }


    /* -----------------------------------------------
       REMOTE AUDIO
    ------------------------------------------------ */

    peerConnection.ontrack =
        function(event) {

            console.log(
                "🔊 Remote voice received"
            );


            if (
                remoteAudio &&
                event.streams &&
                event.streams[0]
            ) {

                remoteAudio.srcObject =
                    event.streams[0];


                remoteAudio.muted =
                    false;


                remoteAudio.volume =
                    1;


                remoteAudio
                    .play()
                    .catch(
                        function(error) {

                            console.log(
                                "Audio waiting:",
                                error
                            );

                        }
                    );

            }

        };


    /* -----------------------------------------------
       ICE CANDIDATES
    ------------------------------------------------ */

    peerConnection.onicecandidate =
        async function(event) {

            if (!event.candidate) {

                return;

            }


            try {

                const candidateCollection =
                    collection(

                        callRef,

                        role === "caller"
                            ? "callerCandidates"
                            : "answererCandidates"

                    );


                await addDoc(

                    candidateCollection,

                    event.candidate.toJSON()

                );


            } catch (error) {

                console.error(
                    "ICE save error:",
                    error
                );

            }

        };


    /* -----------------------------------------------
       CONNECTION STATE
    ------------------------------------------------ */

    peerConnection
        .onconnectionstatechange =
        function() {

            if (!peerConnection) {

                return;

            }


            const state =
                peerConnection
                    .connectionState;


            console.log(
                "WebRTC:",
                state
            );


            if (
                state === "connected"
            ) {

                console.log(
                    "🟢 VOICE CONNECTED"
                );


                if (micText) {

                    micText.innerText =
                        "🟢 وصل شو — مایک ونیسه";

                }

            }


            if (
                state === "connecting"
            ) {

                if (micText) {

                    micText.innerText =
                        "🔄 اړیکه جوړېږي...";

                }

            }


            if (
                state === "failed"
            ) {

                console.log(
                    "🔴 WebRTC failed"
                );


                if (micText) {

                    micText.innerText =
                        "🔴 اړیکه ناکامه شوه";

                }

            }


            if (
                state === "disconnected"
            ) {

                console.log(
                    "🟠 WebRTC disconnected"
                );

            }

        };


    /* -----------------------------------------------
       ICE CONNECTION STATE
    ------------------------------------------------ */

    peerConnection
        .oniceconnectionstatechange =
        function() {

            if (!peerConnection) {

                return;

            }


            console.log(
                "ICE:",
                peerConnection
                    .iceConnectionState
            );

        };


    return peerConnection;

}


/* =====================================================
   WATCH REMOTE ICE
===================================================== */

function watchRemoteCandidates(
    callRef,
    role
) {

    /* -----------------------------------------------
       پخوانی listener بندول
    ------------------------------------------------ */

    if (stopRemoteCandidates) {

        stopRemoteCandidates();

        stopRemoteCandidates =
            null;

    }


    const remoteRole =
        role === "caller"
            ? "answererCandidates"
            : "callerCandidates";


    const candidatesRef =
        collection(
            callRef,
            remoteRole
        );


    stopRemoteCandidates =
        onSnapshot(

            candidatesRef,

            async function(snapshot) {

                if (!peerConnection) {

                    return;

                }


                for (
                    const change of
                    snapshot.docChanges()
                ) {

                    if (
                        change.type !==
                        "added"
                    ) {

                        continue;

                    }


                    try {

                        const data =
                            change.doc.data();


                        const candidate =
                            new RTCIceCandidate(
                                data
                            );


                        if (
                            !peerConnection
                                .remoteDescription
                        ) {

                            remoteCandidateQueue
                                .push(candidate);

                            continue;

                        }


                        await peerConnection
                            .addIceCandidate(
                                candidate
                            );


                    } catch (error) {

                        console.error(
                            "Remote ICE error:",
                            error
                        );

                    }

                }

            },

            function(error) {

                console.error(
                    "ICE listener error:",
                    error
                );

            }

        );

}


/* =====================================================
   ADD QUEUED ICE
===================================================== */

async function addQueuedCandidates() {

    if (!peerConnection) {

        return;

    }


    if (
        !peerConnection
            .remoteDescription
    ) {

        return;

    }


    for (
        const candidate
        of remoteCandidateQueue
    ) {

        try {

            await peerConnection
                .addIceCandidate(
                    candidate
                );

        } catch (error) {

            console.error(
                "Queued ICE error:",
                error
            );

        }

    }


    remoteCandidateQueue =
        [];

}


/* =====================================================
   CREATE CALL
===================================================== */

async function createCall() {

    if (!firebaseUser) {

        alert(
            "⚠️ لومړی Login وکړئ."
        );

        return;

    }


    try {

        closePeerConnection();


        remoteCandidateQueue =
            [];


        const callRef =
            doc(
                collection(
                    db,
                    "calls"
                )
            );


        currentCallId =
            callRef.id;


        const pc =
            await createPeerConnection(
                callRef,
                "caller"
            );


        if (!pc) {

            return;

        }


        const offer =
            await pc.createOffer({

                offerToReceiveAudio:
                    true

            });


        await pc.setLocalDescription(
            offer
        );


        await setDoc(

            callRef,

            {

                channel:
                    currentChannel,

                caller:
                    userId,

                callerName:
                    firebaseUser
                        .displayName ||
                    firebaseUser.email,

                offer: {

                    type:
                        offer.type,

                    sdp:
                        offer.sdp

                },

                status:
                    "waiting",

                createdAt:
                    serverTimestamp()

            }

        );


        stopCallListener =
            onSnapshot(

                callRef,

                async function(snapshot) {

                    const data =
                        snapshot.data();


                    if (!data) {

                        return;

                    }


                    if (
                        data.answer &&
                        !pc.currentRemoteDescription
                    ) {

                        try {

                            await pc
                                .setRemoteDescription(

                                    new RTCSessionDescription(
                                        data.answer
                                    )

                                );


                            console.log(
                                "✅ Answer received"
                            );


                            await addQueuedCandidates();


                        } catch (error) {

                            console.error(
                                "Remote description error:",
                                error
                            );

                        }

                    }


                    if (
                        data.status ===
                        "answered"
                    ) {

                        if (micText) {

                            micText.innerText =
                                "🟢 وصل شو — مایک ونیسه";

                        }

                    }

                },

                function(error) {

                    console.error(
                        "Call listener error:",
                        error
                    );

                }

            );


        watchRemoteCandidates(
            callRef,
            "caller"
        );


        if (micText) {

            micText.innerText =
                "📞 د بل موبایل د قبول انتظار...";

        }


        alert(
            "📞 Voice Call جوړ شو.\n\n" +
            "دوهم موبایل دې Call قبول کړي."
        );


    } catch (error) {

        console.error(
            "Create call error:",
            error
        );


        closePeerConnection();


        alert(
            "❌ Call جوړ نه شو."
        );

    }

}


/* =====================================================
   INCOMING CALLS
===================================================== */

function watchIncomingCalls() {

    if (stopIncomingCalls) {

        stopIncomingCalls();

        stopIncomingCalls =
            null;

    }


    const callsRef =
        collection(
            db,
            "calls"
        );


    stopIncomingCalls =
        onSnapshot(

            callsRef,

            function(snapshot) {

                snapshot.forEach(

                    function(callDoc) {

                        const data =
                            callDoc.data();


                        if (!data) {

                            return;

                        }


                        if (
                            data.channel !==
                            currentChannel
                        ) {

                            return;

                        }


                        if (
                            data.caller ===
                            userId
                        ) {

                            return;

                        }


                        if (
                            data.status !==
                            "waiting"
                        ) {

                            return;

                        }


                        if (
                            activeCallIds
                                .has(
                                    callDoc.id
                                )
                        ) {

                            return;

                        }


                        activeCallIds.add(
                            callDoc.id
                        );


                        showIncomingCall(
                            callDoc.id,
                            data
                        );

                    }

                );

            },

            function(error) {

                console.error(
                    "Incoming call error:",
                    error
                );

            }

        );

}


/* =====================================================
   SHOW INCOMING CALL
===================================================== */

function showIncomingCall(
    callId,
    data
) {

    const callerName =
        data.callerName ||
        "نامعلوم";


    const accepted =
        confirm(

            "📞 نوی Voice Call راغلی دی.\n\n" +
            "👤 " +
            callerName +
            "\n\n" +
            "ایا غواړې Call قبول کړې؟"

        );


    if (accepted) {

        answerCall(
            callId
        );

    } else {

        activeCallIds.delete(
            callId
        );

    }

}


/* =====================================================
   ANSWER CALL
===================================================== */

async function answerCall(
    callId
) {

    try {

        closePeerConnection();


        remoteCandidateQueue =
            [];


        const callRef =
            doc(
                db,
                "calls",
                callId
            );


        const callSnapshot =
            await getDoc(
                callRef
            );


        if (!callSnapshot.exists()) {

            alert(
                "❌ Call پیدا نه شو."
            );

            return;

        }


        const data =
            callSnapshot.data();


        if (
            !data.offer
        ) {

            alert(
                "❌ Offer موجود نه دی."
            );

            return;

        }


        if (
            data.status !==
            "waiting"
        ) {

            alert(
                "⚠️ دا Call لا دمخه قبول شوی."
            );

            return;

        }


        const pc =
            await createPeerConnection(
                callRef,
                "answerer"
            );


        if (!pc) {

            return;

        }


        await pc.setRemoteDescription(

            new RTCSessionDescription(
                data.offer
            )

        );


        await addQueuedCandidates();


        const answer =
            await pc.createAnswer({

                offerToReceiveAudio:
                    true

            });


        await pc.setLocalDescription(
            answer
        );


        await updateDoc(

            callRef,

            {

                answer: {

                    type:
                        answer.type,

                    sdp:
                        answer.sdp

                },

                answerer:
                    userId,

                answererName:
                    firebaseUser
                        ? (
                            firebaseUser
                                .displayName ||
                            firebaseUser.email
                        )
                        : "User",

                status:
                    "answered",

                answeredAt:
                    serverTimestamp()

            }

        );


        watchRemoteCandidates(
            callRef,
            "answerer"
        );


        if (micText) {

            micText.innerText =
                "🟢 وصل شو — مایک ونیسه";

        }


        console.log(
            "✅ Call answered"
        );


        alert(
            "✅ Call قبول شو.\n\n" +
            "اوس مایک ونیسه او خبرې وکړه."
        );


    } catch (error) {

        console.error(
            "Answer error:",
            error
        );


        closePeerConnection();


        alert(
            "❌ Call قبول نشو."
        );

    }

}


/* =====================================================
   PUSH TO TALK - START
===================================================== */

async function startTalking(
    event
) {

    if (event) {

        event.preventDefault();

    }


    isMicPressed =
        true;


    if (!localStream) {

        localStream =
            await getMicrophone();

    }


    if (!localStream) {

        return;

    }


    const track =
        localStream
            .getAudioTracks()[0];


    if (!track) {

        return;

    }


    track.enabled =
        true;


    if (micButton) {

        micButton.classList.add(
            "talking"
        );

    }


    if (micText) {

        micText.innerText =
            "🎙️ خبرې کوه...";

    }


    console.log(
        "🎙️ TALKING"
    );

}


/* =====================================================
   PUSH TO TALK - STOP
===================================================== */

function stopTalking(
    event
) {

    if (event) {

        event.preventDefault();

    }


    isMicPressed =
        false;


    if (!localStream) {

        return;

    }


    const track =
        localStream
            .getAudioTracks()[0];


    if (track) {

        track.enabled =
            false;

    }


    if (micButton) {

        micButton.classList.remove(
            "talking"
        );

    }


    if (micText) {

        micText.innerText =
            "🎙️ د خبرو لپاره ونیسه";

    }


    console.log(
        "🔇 TALKING STOPPED"
    );

}


/* =====================================================
   MIC EVENTS
===================================================== */

if (micButton) {


    micButton.addEventListener(
        "pointerdown",
        startTalking
    );


    micButton.addEventListener(
        "pointerup",
        stopTalking
    );


    micButton.addEventListener(
        "pointercancel",
        stopTalking
    );


    micButton.addEventListener(
        "pointerleave",
        function(event) {

            if (isMicPressed) {

                stopTalking(event);

            }

        }
    );

}


/* =====================================================
   ONLINE USER
===================================================== */

async function joinOnlineUsers() {

    if (!firebaseUser) {

        return;

    }


    try {

        userDocumentRef =
            doc(

                db,

                "channels",

                currentChannel,

                "users",

                userId

            );


        await setDoc(

            userDocumentRef,

            {

                userId:
                    userId,

                name:
                    firebaseUser
                        .displayName ||
                    firebaseUser.email,

                email:
                    firebaseUser.email,

                online:
                    true,

                joinedAt:
                    serverTimestamp()

            }

        );


    } catch (error) {

        console.error(
            "Online user error:",
            error
        );

    }

}


/* =====================================================
   LEAVE ONLINE USER
===================================================== */

async function leaveOnlineUsers() {

    try {

        if (userDocumentRef) {

            await deleteDoc(
                userDocumentRef
            );


            userDocumentRef =
                null;

        }

    } catch (error) {

        console.error(
            "Leave user error:",
            error
        );

    }

}


/* =====================================================
   WATCH ONLINE USERS
===================================================== */

function watchOnlineUsers() {

    if (stopUsersListener) {

        stopUsersListener();

        stopUsersListener =
            null;

    }


    const usersRef =
        collection(

            db,

            "channels",

            currentChannel,

            "users"

        );


    stopUsersListener =
        onSnapshot(

            usersRef,

            function(snapshot) {

                if (userCount) {

                    userCount.innerText =
                        "👥 " +
                        snapshot.size +
                        " Users";

                }

            },

            function(error) {

                console.error(
                    "Users listener:",
                    error
                );

            }

        );

}


/* =====================================================
   CREATE CHANNEL
===================================================== */

async function createChannel() {

    if (!firebaseUser) {

        alert(
            "⚠️ لومړی Login وکړئ."
        );

        return;

    }


    const name =
        prompt(
            "📻 د نوي چینل نوم ولیکه:"
        );


    if (!name) {

        return;

    }


    const cleanName =
        name.trim();


    if (!cleanName) {

        return;

    }


    if (cleanName.length < 2) {

        alert(
            "⚠️ د چینل نوم لږ تر لږه ۲ توري ولري."
        );

        return;

    }


    try {

        const channelRef =
            doc(

                db,

                "channels",

                cleanName

            );


        const existing =
            await getDoc(
                channelRef
            );


        if (existing.exists()) {

            alert(
                "⚠️ دا چینل مخکې موجود دی."
            );

            return;

        }


        await setDoc(

            channelRef,

            {

                name:
                    cleanName,

                createdBy:
                    userId,

                createdByName:
                    firebaseUser
                        .displayName ||
                    firebaseUser.email,

                createdAt:
                    serverTimestamp()

            }

        );


        alert(
            "✅ چینل جوړ شو."
        );


        showChannels();


    } catch (error) {

        console.error(
            "Create channel error:",
            error
        );


        alert(
            "❌ چینل جوړ نشو."
        );

    }

}


/* =====================================================
   SHOW CHANNELS
===================================================== */

function showChannels() {

    if (stopChannelsListener) {

        stopChannelsListener();

        stopChannelsListener =
            null;

    }


    const channelsRef =
        collection(
            db,
            "channels"
        );


    stopChannelsListener =
        onSnapshot(

            channelsRef,

            function(snapshot) {

                if (!channelsBox) {

                    return;

                }


                channelsBox.innerHTML =
                    "";


                if (snapshot.empty) {

                    channelsBox.innerHTML =
                        "<p>📻 تر اوسه چینل نشته.</p>";

                    return;

                }


                snapshot.forEach(

                    function(channelDoc) {

                        const data =
                            channelDoc.data();


                        const button =
                            document.createElement(
                                "button"
                            );


                        button.className =
                            "channel-item";


                        button.type =
                            "button";


                        button.innerHTML =
                            "📻 " +
                            (
                                data.name ||
                                channelDoc.id
                            );


                        button.onclick =
                            function() {

                                joinChannel(

                                    data.name ||
                                    channelDoc.id

                                );

                            };


                        channelsBox
                            .appendChild(
                                button
                            );

                    }

                );

            },

            function(error) {

                console.error(
                    "Channels listener:",
                    error
                );

            }

        );

}


/* =====================================================
   JOIN CHANNEL
===================================================== */

async function joinChannel(
    name
) {

    if (!firebaseUser) {

        return;

    }


    if (!name) {

        return;

    }


    await leaveOnlineUsers();


    if (stopUsersListener) {

        stopUsersListener();

        stopUsersListener =
            null;

    }


    currentChannel =
        name;


    localStorage.setItem(

        "currentWalkieChannel",

        name

    );


    if (channelName) {

        channelName.innerText =
            name;

    }


    await joinOnlineUsers();


    watchOnlineUsers();


    watchIncomingCalls();


    if (micText) {

        micText.innerText =
            "🎙️ د خبرو لپاره ونیسه";

    }


    console.log(
        "📻 Joined:",
        name
    );

}


/* =====================================================
   CALL BUTTON
===================================================== */

if (callButton) {

    callButton.addEventListener(

        "click",

        async function() {

            await createCall();

        }

    );

}


/* =====================================================
   CREATE CHANNEL BUTTON
===================================================== */

if (createChannelButton) {

    createChannelButton.addEventListener(

        "click",

        createChannel

    );

}


/* =====================================================
   SHOW CHANNELS BUTTON
===================================================== */

if (showChannelsButton) {

    showChannelsButton.addEventListener(

        "click",

        showChannels

    );

}


/* =====================================================
   LANGUAGE
===================================================== */

if (languageButton) {

    languageButton.addEventListener(

        "click",

        function() {

            alert(
                "🌐 د ژبې برخه به په راتلونکي درس کې فعاله کړو."
            );

        }

    );

}


/* =====================================================
   CLOSE PEER CONNECTION
===================================================== */

function closePeerConnection() {

    try {

        if (peerConnection) {

            peerConnection.close();

        }

    } catch (error) {

        console.error(error);

    }


    peerConnection =
        null;


    currentCallId =
        null;


    currentRole =
        null;


    remoteCandidateQueue =
        [];


    if (stopCallListener) {

        stopCallListener();

        stopCallListener =
            null;

    }


    if (stopRemoteCandidates) {

        stopRemoteCandidates();

        stopRemoteCandidates =
            null;

    }


    if (remoteAudio) {

        remoteAudio.srcObject =
            null;

    }


    if (micButton) {

        micButton.classList.remove(
            "talking"
        );

    }


    if (micText) {

        micText.innerText =
            "🎙️ د خبرو لپاره ونیسه";

    }

}


/* =====================================================
   START APP
===================================================== */

async function startApp() {

    if (appStarted) {

        return;

    }


    if (!firebaseUser) {

        return;

    }


    appStarted =
        true;


    /*
       Firebase UID
       د کارونکي اصلي ID دی
    */

    userId =
        firebaseUser.uid;


    console.log(
        "📻 Walkie Talkie Started"
    );


    console.log(
        "👤 User:",
        firebaseUser.email
    );


    await joinOnlineUsers();


    watchOnlineUsers();


    watchIncomingCalls();


    showChannels();

}


/* =====================================================
   AUTH STATE
===================================================== */

onAuthStateChanged(

    auth,

    async function(user) {

        if (!user) {

            window.location.href =
                "login.html";

            return;

        }


        firebaseUser =
            user;


        await startApp();

    }

);


/* =====================================================
   PAGE CLOSE
===================================================== */

window.addEventListener(

    "beforeunload",

    function() {

        if (localStream) {

            localStream
                .getTracks()
                .forEach(
                    function(track) {

                        track.stop();

                    }
                );

        }


        closePeerConnection();

    }

);