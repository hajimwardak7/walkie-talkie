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
   HTML
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
   USER ID
===================================================== */

let userId =
    localStorage.getItem(
        "walkieUserId"
    );

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


/* =====================================================
   WEBRTC
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

                    audio: true,

                    video: false

                });


        console.log(
            "🎙️ Microphone ready"
        );


        return localStream;

    } catch (error) {

        console.error(
            error
        );

        alert(
            "🎙️ مهرباني وکړئ د مایکروفون اجازه ورکړئ."
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


    peerConnection =
        new RTCPeerConnection(
            rtcConfiguration
        );


    /* ---------------------------------
       MICROPHONE
    --------------------------------- */

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


    /* ---------------------------------
       REMOTE AUDIO
    --------------------------------- */

    peerConnection.ontrack =
        function(event) {

            console.log(
                "🎧 Remote voice received"
            );


            if (
                remoteAudio &&
                event.streams &&
                event.streams[0]
            ) {

                remoteAudio.srcObject =
                    event.streams[0];


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


    /* ---------------------------------
       ICE CANDIDATE
    --------------------------------- */

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


    /* ---------------------------------
       CONNECTION STATE
    --------------------------------- */

    peerConnection
        .onconnectionstatechange =
        function() {

            const state =
                peerConnection
                    .connectionState;


            console.log(
                "WebRTC:",
                state
            );


            if (state === "connected") {

                console.log(
                    "🟢 Voice connected"
                );

                if (micText) {

                    micText.innerText =
                        "🟢 Voice Connected";

                }

            }


            if (state === "disconnected") {

                console.log(
                    "🟡 Voice disconnected"
                );

            }


            if (state === "failed") {

                console.log(
                    "🔴 Voice failed"
                );

            }

        };


    return peerConnection;

}


/* =====================================================
   WATCH ICE CANDIDATES
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
                    change.type !==
                    "added"
                ) {

                    continue;

                }


                try {

                    const data =
                        change.doc.data();


                    await peerConnection
                        .addIceCandidate(
                            new RTCIceCandidate(
                                data
                            )
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
   CREATE CALL
===================================================== */

async function createCall() {

    try {

        console.log(
            "📞 Creating call..."
        );


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


        /* ---------------------------------
           OFFER
        --------------------------------- */

        const offer =
            await pc.createOffer();


        await pc.setLocalDescription(
            offer
        );


        /* ---------------------------------
           FIREBASE
        --------------------------------- */

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


        console.log(
            "📞 Call saved:",
            callRef.id
        );


        /* ---------------------------------
           WATCH ANSWER
        --------------------------------- */

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


                            watchRemoteCandidates(
                                callRef,
                                "caller"
                            );


                        } catch (error) {

                            console.error(
                                error
                            );

                        }

                    }

                }

            );


        alert(
            "📞 Call جوړ شو.\n\n" +
            "اوس دوهم موبایل ته زنګ ښکاري."
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
   WATCH INCOMING CALLS
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
   INCOMING CALL
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

        console.log(
            "📞 Answering:",
            callId
        );


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


        /* ---------------------------------
           OFFER
        --------------------------------- */

        await pc.setRemoteDescription(

            new RTCSessionDescription(
                data.offer
            )

        );


        /* ---------------------------------
           ANSWER
        --------------------------------- */

        const answer =
            await pc.createAnswer();


        await pc.setLocalDescription(
            answer
        );


        /* ---------------------------------
           SAVE ANSWER
        --------------------------------- */

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


        /* ---------------------------------
           WATCH CALLER ICE
        --------------------------------- */

        watchRemoteCandidates(
            callRef,
            "answerer"
        );


        console.log(
            "✅ Answer saved"
        );


        alert(
            "✅ Call قبول شو.\n\n" +
            "د غږ اتصال جوړېږي."
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
   ONLINE USER
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
   LEAVE USER
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

                const count =
                    snapshot.size;


                if (userCount) {

                    userCount.innerText =
                        "👥 " +
                        count +
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

                users:
                    0,

                createdAt:
                    Date.now()

            }

        );


        alert(
            "✅ چینل جوړ شو"
        );


        showChannels();


    } catch (error) {

        console.error(
            error
        );


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
                            document
                                .createElement(
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

async function joinChannel(name) {

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
   MICROPHONE
===================================================== */

if (micButton) {

    micButton.addEventListener(

        "click",

        async function() {

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
                !track.enabled;


            if (track.enabled) {

                micButton.classList.add(
                    "talking"
                );


                if (micText) {

                    micText.innerText =
                        "🎙️ خبرې کوه...";

                }

            } else {

                micButton.classList.remove(
                    "talking"
                );


                if (micText) {

                    micText.innerText =
                        "🎙️ د خبرو لپاره ونیسه";

                }

            }

        }

    );

}


/* =====================================================
   PUSH TO TALK
===================================================== */

if (micButton) {

    micButton.addEventListener(

        "touchstart",

        async function(event) {

            event.preventDefault();


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


            if (track) {

                track.enabled =
                    true;

            }


            micButton.classList.add(
                "talking"
            );


            if (micText) {

                micText.innerText =
                    "🎙️ خبرې کوه...";

            }

        }

    );


    micButton.addEventListener(

        "touchend",

        function(event) {

            event.preventDefault();


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


            micButton.classList.remove(
                "talking"
            );


            if (micText) {

                micText.innerText =
                    "🎙️ د خبرو لپاره ونیسه";

            }

        }

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

const createChannelButton =
    document.getElementById(
        "createChannelButton"
    );


if (createChannelButton) {

    createChannelButton.addEventListener(
        "click",
        createChannel
    );

}


/* =====================================================
   SHOW CHANNEL BUTTON
===================================================== */

const showChannelsButton =
    document.getElementById(
        "showChannelsButton"
    );


if (showChannelsButton) {

    showChannelsButton.addEventListener(
        "click",
        showChannels
    );

}


/* =====================================================
   LANGUAGE
===================================================== */

const languageButton =
    document.getElementById(
        "languageButton"
    );


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


startApp();


/* =====================================================
   CLOSE
===================================================== */

window.addEventListener(

    "beforeunload",

    function() {

        if (peerConnection) {

            peerConnection.close();

        }

    }

);