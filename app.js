import {
    db
} from "./firebase.js";

import {
    collection,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    onSnapshot,
    updateDoc,
    addDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


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

let userId =
    localStorage.getItem("walkieUserId");

if (!userId) {

    userId =
        "user-" +
        Math.random()
            .toString(36)
            .substring(2, 10);

    localStorage.setItem(
        "walkieUserId",
        userId
    );
}


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

let peerConnection = null;

let localStream = null;

let currentCallId = null;

let currentRole = null;

let remoteCandidateQueue = [];

let isMicPressed = false;


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
                "ستاسې براوزر د مایکروفون ملاتړ نه کوي."
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


        /*
         د پیل پر وخت مایک بند ساتو
        */

        const tracks =
            localStream.getAudioTracks();

        tracks.forEach(
            function(track) {

                track.enabled = false;

            }
        );


        return localStream;


    } catch (error) {

        console.error(
            "Microphone error:",
            error
        );

        alert(
            "🎙️ د مایکروفون اجازه ورکړئ."
        );

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


    currentRole = role;


    peerConnection =
        new RTCPeerConnection(
            rtcConfiguration
        );


    /*
       Microphone
    */

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


    /*
       Remote Audio
    */

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


                remoteAudio.muted = false;


                remoteAudio
                    .play()
                    .catch(
                        function(error) {

                            console.log(
                                "Audio play waiting:",
                                error
                            );

                        }
                    );

            }

        };


    /*
       ICE Candidates
    */

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


                console.log(
                    "🧊 ICE candidate saved"
                );


            } catch (error) {

                console.error(
                    "ICE save error:",
                    error
                );

            }

        };


    /*
       Connection State
    */

    peerConnection
        .onconnectionstatechange =
        function() {

            if (!peerConnection) {

                return;

            }


            const state =
                peerConnection.connectionState;


            console.log(
                "WebRTC:",
                state
            );


            if (state === "connected") {

                console.log(
                    "🟢 VOICE CONNECTED"
                );


                if (micText) {

                    micText.innerText =
                        "🟢 وصل شو — مایک ونیسه";

                }

            }


            if (
                state === "disconnected" ||
                state === "failed" ||
                state === "closed"
            ) {

                console.log(
                    "🔴 Voice disconnected"
                );

            }

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

    const remoteRole =
        role === "caller"
            ? "answererCandidates"
            : "callerCandidates";


    const candidatesRef =
        collection(
            callRef,
            remoteRole
        );


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
                    change.type !== "added"
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


                    /*
                       که Remote Description لا نه وي،
                       candidate په queue کې ساتو.
                    */

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


                    console.log(
                        "🧊 Remote ICE added"
                    );


                } catch (error) {

                    console.error(
                        "Remote ICE error:",
                        error
                    );

                }

            }

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
        !peerConnection.remoteDescription
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


    remoteCandidateQueue = [];

}


/* =====================================================
   CREATE CALL
===================================================== */

async function createCall() {

    try {

        /*
           که پخوانی connection وي،
           لومړی یې بندوه
        */

        closePeerConnection();


        remoteCandidateQueue = [];


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


        /*
           Offer
        */

        const offer =
            await pc.createOffer({

                offerToReceiveAudio: true

            });


        await pc.setLocalDescription(
            offer
        );


        /*
           Call Firestore ته
        */

        await setDoc(

            callRef,

            {

                channel:
                    currentChannel,

                caller:
                    userId,

                offer: {

                    type:
                        offer.type,

                    sdp:
                        offer.sdp

                },

                status:
                    "waiting",

                createdAt:
                    Date.now()

            }

        );


        /*
           د بل موبایل Answer څارو
        */

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

                }

            );


        /*
           ICE سمدستي څارو
        */

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

    const accepted =
        confirm(

            "📞 نوی Voice Call راغلی دی.\n\n" +
            "ایا غواړې Call قبول کړې؟"

        );


    if (accepted) {

        answerCall(
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


        remoteCandidateQueue = [];


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


        if (!data.offer) {

            alert(
                "❌ Offer موجود نه دی."
            );

            return;

        }


        const pc =
            await createPeerConnection(
                callRef,
                "answerer"
            );


        /*
           Offer
        */

        await pc.setRemoteDescription(

            new RTCSessionDescription(
                data.offer
            )

        );


        /*
           مخکې راغلي ICE candidates
        */

        await addQueuedCandidates();


        /*
           Answer
        */

        const answer =
            await pc.createAnswer({

                offerToReceiveAudio: true

            });


        await pc.setLocalDescription(
            answer
        );


        /*
           Answer Firebase ته
        */

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

                status:
                    "answered",

                answeredAt:
                    Date.now()

            }

        );


        /*
           Caller ICE څارو
        */

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


    isMicPressed = true;


    /*
       Microphone
    */

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


    /*
       غږ ON
    */

    track.enabled = true;


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


    isMicPressed = false;


    if (!localStream) {

        return;

    }


    const track =
        localStream
            .getAudioTracks()[0];


    if (track) {

        track.enabled = false;

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


    /*
       Android / Touch
    */

    micButton.addEventListener(
        "touchstart",
        startTalking,
        {
            passive: false
        }
    );


    micButton.addEventListener(
        "touchend",
        stopTalking,
        {
            passive: false
        }
    );


    micButton.addEventListener(
        "touchcancel",
        stopTalking,
        {
            passive: false
        }
    );


    /*
       Mouse / PC
    */

    micButton.addEventListener(
        "mousedown",
        startTalking
    );


    micButton.addEventListener(
        "mouseup",
        stopTalking
    );


    micButton.addEventListener(
        "mouseleave",
        stopTalking
    );

}


/* =====================================================
   CHANNEL ONLINE USER
===================================================== */

async function joinOnlineUsers() {

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

                online:
                    true,

                joinedAt:
                    Date.now()

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

        console.error(error);

    }

}


/* =====================================================
   WATCH ONLINE USERS
===================================================== */

function watchOnlineUsers() {

    if (stopUsersListener) {

        stopUsersListener();

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

            }

        );

}


/* =====================================================
   CREATE CHANNEL
===================================================== */

async function createChannel() {

    const name =
        prompt(
            "د نوي چینل نوم ولیکه:"
        );


    if (!name) {

        return;

    }


    const cleanName =
        name.trim();


    if (!cleanName) {

        return;

    }


    try {

        const channelRef =
            doc(

                db,

                "channels",

                cleanName

            );


        await setDoc(

            channelRef,

            {

                name:
                    cleanName,

                createdAt:
                    Date.now()

            }

        );


        alert(
            "✅ چینل جوړ شو"
        );


        showChannels();


    } catch (error) {

        console.error(error);


        alert(
            "❌ چینل جوړ نشو"
        );

    }

}


/* =====================================================
   SHOW CHANNELS
===================================================== */

function showChannels() {

    if (stopChannelsListener) {

        stopChannelsListener();

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
                        "<p>هیڅ چینل نشته</p>";

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


                        button.innerHTML =
                            "📻 " +
                            data.name;


                        button.onclick =
                            function() {

                                joinChannel(
                                    data.name
                                );

                            };


                        channelsBox
                            .appendChild(
                                button
                            );

                    }

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

    if (!name) {

        return;

    }


    await leaveOnlineUsers();


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


    alert(

        "📻 چینل ته داخل شوې:\n" +
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
                "🌐 د ژبې برخه به وروسته فعاله کړو."
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


    if (remoteAudio) {

        remoteAudio.srcObject =
            null;

    }


    if (stopCallListener) {

        stopCallListener();

        stopCallListener =
            null;

    }

}


/* =====================================================
   START APP
===================================================== */

async function startApp() {

    console.log(
        "📻 Walkie Talkie Started"
    );


    await joinOnlineUsers();


    watchOnlineUsers();


    watchIncomingCalls();


    showChannels();

}


/* =====================================================
   PAGE START
===================================================== */

startApp();


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