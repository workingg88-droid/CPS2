var audio = new Audio('assets/sentmessage.mp3');

var GROUP_NAME = "CPS2";
var GROUP_SUBTITLE = "Assignments, Quizzes, Exams";

var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
var dbOk = false;
var auth = null;      // { name, pass } kept in memory for this visit only
var flow = null;      // current add/edit/delete conversation
var subjects = [];    // [{id,name,teacher,cats:[{id,label,items:[{id,title,date,by}]}]}]
var opts = [];        // tappable options registry

// ---------- helpers ----------
function esc(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function byPos(a, b) { return (a.position - b.position) || (a.id - b.id); }

// Everything (subjects, teachers, lists, items) comes from Supabase.
async function loadData() {
    try {
        var res = await sb.from("subjects")
            .select("id,name,teacher,position,categories(id,label,position,items(id,title,date,updated_by))");
        if (res.error) throw res.error;
        subjects = res.data.map(function (s) {
            return {
                id: s.id, name: s.name, teacher: s.teacher, position: s.position,
                cats: (s.categories || []).map(function (c) {
                    return {
                        id: c.id, label: c.label, position: c.position,
                        items: (c.items || []).map(function (i) {
                            return { id: i.id, title: i.title, date: i.date, by: i.updated_by };
                        })
                    };
                }).sort(byPos)
            };
        }).sort(byPos);
        dbOk = true;
    } catch (e) {
        dbOk = false;
        console.error("Supabase load failed", e);
    }
}

function findSubject(id) { return subjects.filter(function (s) { return s.id === id; })[0]; }
function findCat(id) {
    for (var i = 0; i < subjects.length; i++) {
        for (var j = 0; j < subjects[i].cats.length; j++) {
            if (subjects[i].cats[j].id === id) return { s: subjects[i], c: subjects[i].cats[j] };
        }
    }
    return null;
}

// tappable option: shows `label`, sends `cmd` (the chat bubble shows the label)
function opt(cmd, label) {
    opts.push({ cmd: cmd, label: label });
    return "<span class='opt' onclick='quickN(" + (opts.length - 1) + ")'>" + esc(label) + "</span>";
}
function quickN(i) { sendMsg(opts[i].cmd, opts[i].label); }

function menuHtml() {
    var html = "";
    if (!subjects.length) html += "No subjects yet.<br>";
    subjects.forEach(function (s, i) {
        var what = s.cats.map(function (c) { return c.label; }).join(", ") || "no lists yet";
        html += opt("go s" + s.id, (i + 1) + ". " + s.name) + "<br>&nbsp;&nbsp;" + esc(what) + "<br>";
    });
    var n = subjects.length;
    return html + "<br>" +
        opt("add", (n + 1) + ". Add") + " - item, list or subject (password)<br>" +
        opt("edit", (n + 2) + ". Edit") + " - item, list or subject (password)<br>" +
        opt("delete", (n + 3) + ". Delete") + " - item, list or subject (password)<br>" +
        opt("clear", (n + 4) + ". Clear") + " - clear conversation";
}

function showMenu() {
    sendTextMessage("<span class='sk'>Back to the main menu:<br><br>" + menuHtml() + "</span>");
}

function setInputType() {
    document.getElementById("inputMSG").type = (flow && flow.step === "password") ? "password" : "text";
}

function startFunction() {
    setSubtitle();
    loadData().then(function () { waitAndResponce("intro"); });
}

function setSubtitle() {
    document.getElementById("lastseen").innerText = GROUP_SUBTITLE;
}

function closeFullDP() {
    var x = document.getElementById("fullScreenDP");
    x.style.display = (x.style.display === 'flex') ? 'none' : 'flex';
}

function openFullScreenDP() {
    closeFullDP();
}

function isEnter(event) {
    if (event.keyCode == 13) {
        sendMsg();
    }
}

function pad(n) {
    return n < 10 ? "0" + n : n;
}

function timeNow() {
    var d = new Date();
    return d.getHours() + ":" + pad(d.getMinutes());
}

function formatDate(d) {
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function byLine(a) {
    return a.by ? "&nbsp;&nbsp;<i>updated by " + esc(a.by) + "</i><br>" : "";
}

function buildSection(subj, cat) {
    var now = new Date();

    var items = cat.items.map(function (a) {
        var p = a.date.split("-");
        return { title: a.title, by: a.by, dueDate: new Date(+p[0], +p[1] - 1, +p[2], 23, 59, 59) };
    });

    var upcoming = items.filter(function (a) { return a.dueDate >= now; })
        .sort(function (a, b) { return a.dueDate - b.dueDate; });
    var previous = items.filter(function (a) { return a.dueDate < now; })
        .sort(function (a, b) { return b.dueDate - a.dueDate; });

    var html = "<span class='sk'><span class='bold'>" + esc(subj.name) + " - " + esc(cat.label) +
        "</span><br>Today: " + formatDate(now) + "<br><br>";

    html += "<span class='bold'>Upcoming</span><br>";
    if (upcoming.length === 0) {
        html += "Nothing upcoming.<br>";
    } else {
        upcoming.forEach(function (a) {
            var days = Math.ceil((a.dueDate - now) / 86400000);
            var left = days <= 1 ? "today/tomorrow" : days + " days left";
            html += "&bull; " + esc(a.title) + "<br>&nbsp;&nbsp;" + formatDate(a.dueDate) + " (" + left + ")<br>" + byLine(a);
        });
    }

    html += "<br><span class='bold'>Previous</span><br>";
    if (previous.length === 0) {
        html += "Nothing previous.<br>";
    } else {
        previous.forEach(function (a) {
            html += "&bull; " + esc(a.title) + "<br>&nbsp;&nbsp;" + formatDate(a.dueDate) + "<br>" + byLine(a);
        });
    }
    return html + "</span>";
}

function subjectMenu(subj) {
    var html = "<span class='sk'><span class='bold'>" + esc(subj.name) + "</span><br>";
    if (subj.teacher) html += "Teacher: " + esc(subj.teacher) + "<br>";
    html += "<br>";
    if (!subj.cats.length) {
        html += "No lists yet.<br>";
    } else {
        html += "Tap one:<br>";
        subj.cats.forEach(function (c, i) {
            html += opt("go c" + c.id, (i + 1) + ". " + c.label) + "<br>";
        });
    }
    return html + "<br>" + opt("help", "Back to menu") + "</span>";
}

// ---------- sending / receiving ----------
// cmd/display are only given when an option was tapped; otherwise the text comes from the input box
function sendMsg(cmd, display) {
    var input = document.getElementById("inputMSG");
    var fromTap = (typeof cmd === "string");
    var ti = fromTap ? cmd : input.value;
    if (ti == "") {
        return;
    }
    var shown = (typeof display === "string") ? display : ti;
    var myLI = document.createElement("li");
    var myDiv = document.createElement("div");
    var greendiv = document.createElement("div");
    var dateLabel = document.createElement("label");
    dateLabel.innerText = timeNow();
    myDiv.setAttribute("class", "sent");
    greendiv.setAttribute("class", "green");
    dateLabel.setAttribute("class", "dateLabel");
    greendiv.innerText = (flow && flow.step === "password") ? "\u2022".repeat(ti.length) : shown;
    myDiv.appendChild(greendiv);
    myLI.appendChild(myDiv);
    greendiv.appendChild(dateLabel);
    document.getElementById("listUL").appendChild(myLI);
    var s = document.getElementById("chatting");
    s.scrollTop = s.scrollHeight;
    setTimeout(function () { waitAndResponce(ti) }, 1000);
    if (!fromTap) input.value = "";
    playSound();
}

function matchingCats(word) {
    var found = [];
    subjects.forEach(function (s) {
        s.cats.forEach(function (c) {
            if (c.label.toLowerCase().indexOf(word) === 0) found.push({ s: s, c: c });
        });
    });
    return found;
}

function waitAndResponce(inputText) {
    document.getElementById("lastseen").innerText = "typing...";
    if (flow) { handleFlow(inputText); return; }

    var cmd = inputText.toLowerCase().trim();
    var K = subjects.length;
    var num = /^\d+$/.test(cmd) ? parseInt(cmd, 10) : 0;
    if (num >= 1 && num <= K) { sendTextMessage(subjectMenu(subjects[num - 1])); return; }
    var actions = ["add", "edit", "delete", "clear"];
    if (num > K && num <= K + actions.length) cmd = actions[num - K - 1];

    switch (cmd) {
        case "intro":
            setTimeout(() => {
                sendTextMessage("Welcome to <span class='bold'>" + esc(GROUP_NAME) + "</span> 👋🏻<br><br><span class='sk'>Type or tap an option:<br><br>" + menuHtml() + "</span>");
            }, 800);
            return;
        case "help":
        case "menu":
        case "back":
            loadData().then(function () {
                sendTextMessage("<span class='sk'>Type or tap an option:<br><br>" + menuHtml() + "</span>");
            });
            return;
        case "add":
        case "edit":
        case "delete":
            startFlow(cmd);
            return;
        case "clear":
            clearChat();
            return;
        case "logout":
            auth = null;
            sendTextMessage("Logged out.");
            return;
    }

    // tapped "go s<id>" (subject) or "go c<id>" (list)
    var g = /^go ([sc])(\d+)$/.exec(cmd);
    if (g) {
        var id = parseInt(g[2], 10);
        loadData().then(function () {
            if (g[1] === "s") {
                var s = findSubject(id);
                sendTextMessage(s ? subjectMenu(s) : "That subject no longer exists.");
            } else {
                var f = findCat(id);
                sendTextMessage(f ? buildSection(f.s, f.c) : "That list no longer exists.");
            }
        });
        return;
    }

    // typed words: part of a subject name, or part of a list name
    if (cmd.length >= 3) {
        loadData().then(function () {
            var subs = subjects.filter(function (s) { return s.name.toLowerCase().indexOf(cmd) === 0; });
            if (subs.length === 1) { sendTextMessage(subjectMenu(subs[0])); return; }
            var cats = matchingCats(cmd);
            if (cats.length) {
                cats.forEach(function (x) { sendTextMessage(buildSection(x.s, x.c)); });
                return;
            }
            sendTextMessage("Couldn't catch that...😢<br>Send 'help' to see the options.");
        });
        return;
    }

    setTimeout(() => {
        sendTextMessage("Couldn't catch that...😢<br>Send 'help' to see the options.");
    }, 1000);
}

// ---------- add / edit / delete conversation ----------
function say(html) { sendTextMessage("<span class='sk'>" + html + "</span>"); }

// ends the conversation and returns the user to the main menu
function endFlow() {
    flow = null;
    setInputType();
    setTimeout(showMenu, 700);
}

var BACK = "(or 'menu' to go back)";

function numbered(arr, labelFn) {
    return arr.map(function (x, i) { return (i + 1) + ". " + esc(labelFn(x)); }).join("<br>");
}

// pick by number or by the start of the name
function pickFrom(t, arr, labelFn) {
    t = t.toLowerCase().trim();
    var n = parseInt(t, 10);
    if (String(n) === t && n >= 1 && n <= arr.length) return arr[n - 1];
    if (t.length >= 3) {
        for (var i = 0; i < arr.length; i++) {
            if (labelFn(arr[i]).toLowerCase().indexOf(t) === 0) return arr[i];
        }
    }
    return null;
}

function whatPrompt(type) {
    return "What do you want to " + type + "?<br>1. An item (assignment, quiz, exam...)<br>2. A list (e.g. Assignments) inside a subject<br>3. A subject<br>" + BACK;
}
function subjPrompt() { return "Which subject?<br>" + numbered(subjects, function (s) { return s.name; }) + "<br>" + BACK; }
function catPrompt(subj) { return "Which list of <span class='bold'>" + esc(subj.name) + "</span>?<br>" + numbered(subj.cats, function (c) { return c.label; }) + "<br>" + BACK; }

async function startFlow(type) {
    await loadData();
    if (!dbOk) { say("Can't reach the database right now, so editing is unavailable."); setTimeout(showMenu, 700); return; }
    if (auth) {
        flow = { type: type, step: "what" };
        say("Logged in as <span class='bold'>" + esc(auth.name) + "</span>.<br>" + whatPrompt(type));
    } else {
        flow = { type: type, step: "name" };
        say("Editing is protected.<br>Enter your <span class='bold'>name</span> " + BACK + ":");
    }
    setInputType();
}

function validDate(t) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (!m) return false;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() == +m[1] && d.getMonth() == +m[2] - 1 && d.getDate() == +m[3];
}

function itemList(cat) {
    return cat.items.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}

function listHtml(list) {
    return list.map(function (i, n) { return (n + 1) + ". " + esc(i.title) + " (" + i.date + ")"; }).join("<br>");
}

function rpcFail(e) {
    if (e && /Invalid credentials/i.test(e.message || "")) {
        auth = null;
        say("❌ Wrong name or password.");
    } else {
        say("❌ " + esc((e && e.message) || "Something went wrong."));
    }
    endFlow();
}

function B(t) { return "<span class='bold'>" + esc(t) + "</span>"; }

// runs an RPC, refreshes data, shows `okHtml(editorName)` and returns to the menu
async function runRpc(fn, args, okHtml) {
    var r = await sb.rpc(fn, Object.assign({ p_name: auth.name, p_pass: auth.pass }, args));
    if (r.error) { rpcFail(r.error); return; }
    await loadData();
    say("✅ " + B(r.data) + " " + okHtml);
    endFlow();
}

async function handleFlow(text) {
    var t = text.trim();
    var low = t.toLowerCase();
    if (low === "cancel" || low === "menu" || low === "back") { endFlow(); say("Cancelled."); return; }

    switch (flow.step) {
        case "name":
            flow.name = t;
            flow.step = "password";
            setInputType();
            say("Enter your <span class='bold'>password</span>:");
            break;

        case "password":
            var r = await sb.rpc("editor_login", { p_name: flow.name, p_pass: t });
            if (r.error) { rpcFail(r.error); break; }
            auth = { name: r.data, pass: t };
            flow.step = "what";
            setInputType();
            say("✅ Welcome " + B(auth.name) + "!<br>" + whatPrompt(flow.type));
            break;

        case "what":
            var w = { "1": "item", "2": "list", "3": "subject", "item": "item", "list": "list", "subject": "subject" }[low];
            if (!w) { say("Please send 1, 2 or 3 " + BACK + "."); break; }
            flow.what = w;
            if (w === "subject" && flow.type === "add") {
                flow.step = "sname";
                say("Send the <span class='bold'>subject name</span>:");
                break;
            }
            if (!subjects.length) { endFlow(); say("There are no subjects yet. Add one first."); break; }
            flow.step = "subj";
            say(subjPrompt());
            break;

        // ----- add subject -----
        case "sname":
            if (!t) { say("Name can't be empty."); break; }
            flow.sname = t;
            flow.step = "steacher";
            say("Send the <span class='bold'>teacher name</span>, or '-' for none:");
            break;
        case "steacher":
            await runRpc("add_subject", { p_sname: flow.sname, p_teacher: t === "-" ? "" : t },
                "added subject " + B(flow.sname) + (t === "-" ? "." : " (" + esc(t) + ")."));
            break;

        // ----- choose subject -----
        case "subj":
            var sj = pickFrom(t, subjects, function (s) { return s.name; });
            if (!sj) { say("Please send a number from 1 to " + subjects.length + " " + BACK + "."); break; }
            flow.subj = sj;
            if (flow.what === "subject") {
                if (flow.type === "edit") {
                    flow.step = "snewname";
                    say("Current name: " + B(sj.name) + "<br>Send the new name, or '-' to keep it:");
                } else {
                    flow.step = "confirm";
                    say("Delete subject " + B(sj.name) + " with ALL its lists and items?<br>Send 'yes' to confirm " + BACK + ".");
                }
            } else if (flow.what === "list") {
                if (flow.type === "add") {
                    flow.step = "lname";
                    say("Send the <span class='bold'>list name</span> (e.g. Assignments, Quizzes, Exams):");
                } else if (!sj.cats.length) {
                    endFlow(); say("This subject has no lists yet.");
                } else {
                    flow.step = "pickcat";
                    say(catPrompt(sj));
                }
            } else {
                if (!sj.cats.length) { endFlow(); say("This subject has no lists yet. Add a list first."); break; }
                flow.step = "cat";
                say(catPrompt(sj));
            }
            break;

        // ----- lists -----
        case "lname":
            if (!t) { say("Name can't be empty."); break; }
            await runRpc("add_category", { p_subject_id: flow.subj.id, p_label: t },
                "added list " + B(t) + " to " + B(flow.subj.name) + ".");
            break;

        case "pickcat":
            var pc = pickFrom(t, flow.subj.cats, function (c) { return c.label; });
            if (!pc) { say("Please send a number from 1 to " + flow.subj.cats.length + " " + BACK + "."); break; }
            flow.cat = pc;
            if (flow.type === "edit") {
                flow.step = "newlabel";
                say("Current name: " + B(pc.label) + "<br>Send the new name:");
            } else {
                flow.step = "confirm";
                say("Delete list " + B(pc.label) + " and its " + pc.items.length + " item(s)?<br>Send 'yes' to confirm " + BACK + ".");
            }
            break;

        case "newlabel":
            if (!t) { say("Name can't be empty."); break; }
            await runRpc("edit_category", { p_id: flow.cat.id, p_label: t },
                "renamed list " + B(flow.cat.label) + " → " + B(t) + ".");
            break;

        // ----- edit subject -----
        case "snewname":
            flow.newName = (t === "-") ? flow.subj.name : t;
            flow.step = "snewteacher";
            say("Current teacher: " + B(flow.subj.teacher || "(none)") + "<br>Send the new teacher, '-' to keep it, or 'none' to clear it:");
            break;
        case "snewteacher":
            var nt = (t === "-") ? flow.subj.teacher : (low === "none" ? "" : t);
            await runRpc("edit_subject", { p_id: flow.subj.id, p_sname: flow.newName, p_teacher: nt },
                "updated subject " + B(flow.subj.name) + "<br>→ " + B(flow.newName) + (nt ? " (" + esc(nt) + ")" : "") + ".");
            break;

        // ----- items -----
        case "cat":
            var c = pickFrom(t, flow.subj.cats, function (x) { return x.label; });
            if (!c) { say("Please send a number from 1 to " + flow.subj.cats.length + " " + BACK + "."); break; }
            flow.cat = c;
            if (flow.type === "add") {
                flow.step = "title";
                say("Send the <span class='bold'>title</span> (e.g. Assignment 7):");
            } else {
                var list = itemList(c);
                if (!list.length) { endFlow(); say("Nothing in " + B(c.label) + " yet."); break; }
                flow.list = list;
                flow.step = "pick";
                say("Send the <span class='bold'>number</span> of the item:<br><br>" + listHtml(list));
            }
            break;

        case "title":
            if (!t) { say("Title can't be empty."); break; }
            flow.title = t;
            flow.step = "date";
            say("Send the <span class='bold'>date</span> as YYYY-MM-DD (e.g. 2026-11-20):");
            break;

        case "date":
            if (!validDate(t)) { say("Invalid date. Use YYYY-MM-DD, e.g. 2026-11-20."); break; }
            await runRpc("add_item", { p_category_id: flow.cat.id, p_title: flow.title, p_date: t },
                "added " + B(flow.title) + " to " + B(flow.subj.name) + " - " + B(flow.cat.label) + " (" + t + ").");
            break;

        case "pick":
            var n = parseInt(t, 10);
            if (!(n >= 1 && n <= flow.list.length)) { say("Send a number between 1 and " + flow.list.length + "."); break; }
            flow.item = flow.list[n - 1];
            if (flow.type === "edit") {
                flow.step = "newtitle";
                say("Current title: " + B(flow.item.title) + "<br>Send the new title, or '-' to keep it:");
            } else {
                flow.step = "confirm";
                say("Delete " + B(flow.item.title) + " (" + flow.item.date + ")?<br>Send 'yes' to confirm " + BACK + ".");
            }
            break;

        case "newtitle":
            flow.newTitle = (t === "-") ? flow.item.title : t;
            flow.step = "newdate";
            say("Current date: " + B(flow.item.date) + "<br>Send the new date (YYYY-MM-DD), or '-' to keep it:");
            break;

        case "newdate":
            var nd = (t === "-") ? flow.item.date : t;
            if (!validDate(nd)) { say("Invalid date. Use YYYY-MM-DD, or '-' to keep."); break; }
            await runRpc("edit_item", { p_id: flow.item.id, p_title: flow.newTitle, p_date: nd },
                "updated " + B(flow.item.title) + "<br>→ " + B(flow.newTitle) + " (" + nd + ")");
            break;

        // ----- delete (item / list / subject) -----
        case "confirm":
            if (low !== "yes") { say("Send 'yes' to delete, or 'menu' to go back."); break; }
            if (flow.what === "item") {
                await runRpc("delete_item", { p_id: flow.item.id }, "🗑️ deleted " + B(flow.item.title) + ".");
            } else if (flow.what === "list") {
                await runRpc("delete_category", { p_id: flow.cat.id }, "🗑️ deleted list " + B(flow.cat.label) + ".");
            } else {
                await runRpc("delete_subject", { p_id: flow.subj.id }, "🗑️ deleted subject " + B(flow.subj.name) + ".");
            }
            break;
    }
}

function clearChat() {
    document.getElementById("listUL").innerHTML = "";
    waitAndResponce('intro');
}

function sendTextMessage(textToSend) {
    setTimeout(setSubtitle, 800);
    var myLI = document.createElement("li");
    var myDiv = document.createElement("div");
    var greendiv = document.createElement("div");
    var dateLabel = document.createElement("label");
    dateLabel.id = "sentlabel";
    dateLabel.innerText = timeNow();
    myDiv.setAttribute("class", "received");
    greendiv.setAttribute("class", "grey");
    greendiv.innerHTML = textToSend;
    myDiv.appendChild(greendiv);
    myLI.appendChild(myDiv);
    greendiv.appendChild(dateLabel);
    document.getElementById("listUL").appendChild(myLI);
    var s = document.getElementById("chatting");
    s.scrollTop = s.scrollHeight;
    playSound();
}

function playSound() {
    audio.play();
}
