var audio = new Audio('assets/sentmessage.mp3');

var GROUP_NAME = "CPS2";
var GROUP_SUBTITLE = "Assignments, Quizzes, Exams";

var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
var dbOk = false;
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

// ---------- date helpers ----------
function parseD(str) { var p = str.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function dayDiff(str) {
    var n = new Date();
    var today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((parseD(str) - today) / 86400000);
}
function fmtDate(str) {
    return parseD(str).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function whenText(d) {
    if (d === 0) return "Today";
    if (d === 1) return "Tomorrow";
    if (d > 1) return "in " + d + " days";
    if (d === -1) return "Yesterday";
    return Math.abs(d) + " days ago";
}
function urgency(d) { return d < 0 ? "past" : d <= 3 ? "urgent" : d <= 7 ? "soon" : "ok"; }
function byDateAsc(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }
function upcomingOf(cat) { return cat.items.filter(function (i) { return dayDiff(i.date) >= 0; }).sort(byDateAsc); }
function nextOfSubject(s) {
    var all = [];
    s.cats.forEach(function (c) { all = all.concat(upcomingOf(c)); });
    return all.sort(byDateAsc)[0] || null;
}

// ---------- tappable options (the chat bubble shows `label`, the bot receives `cmd`) ----------
function reg(cmd, label) { opts.push({ cmd: cmd, label: label }); return opts.length - 1; }
function optBtn(cmd, label) {
    return "<span class='btn' onclick='quickN(" + reg(cmd, label) + ")'>" + esc(label) + "</span>";
}
function optCard(cmd, label, innerHtml) {
    return "<div class='subj-card' onclick='quickN(" + reg(cmd, label) + ")'>" + innerHtml + "</div>";
}
function quickN(i) { sendMsg(opts[i].cmd, opts[i].label); }

function menuHtml() {
    var html = "<div class='sec'>Subjects</div>";
    if (!subjects.length) html += "<div class='empty'>No subjects yet. Use Add to create one.</div>";
    subjects.forEach(function (s, i) {
        var nx = nextOfSubject(s);
        var line = nx ? "Next: " + nx.title + " · " + whenText(dayDiff(nx.date)) : "Nothing upcoming";
        html += optCard("go s" + s.id, (i + 1) + ". " + s.name,
            "<span class='n'>" + (i + 1) + "</span><div><div class='t'>" + esc(s.name) + "</div>" +
            "<div class='d'>" + (s.teacher ? esc(s.teacher) + "<br>" : "") + esc(line) + "</div></div>");
    });
    var n = subjects.length;
    html += "<div class='sec'>More</div><div class='btns'>" +
        optBtn("next", "📅 What's next") +
        optBtn("clear", "🧹 Clear (" + (n + 1) + ")") + "</div>";
    return html;
}

function showMenu() {
    sendTextMessage("<div class='card'><div class='card-title'>Main menu</div>" + menuHtml() + "</div>");
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

function itemRow(it, extra) {
    var d = dayDiff(it.date), u = urgency(d);
    return "<div class='it " + u + "'><div><div class='t'>" + esc(it.title) + "</div><div class='d'>" +
        (extra ? esc(extra) + " · " : "") + esc(fmtDate(it.date)) + (it.by ? " · updated by " + esc(it.by) : "") +
        "</div></div><span class='chip " + u + "'>" + whenText(d) + "</span></div>";
}

function buildSection(subj, cat) {
    var up = upcomingOf(cat);
    var prev = cat.items.filter(function (i) { return dayDiff(i.date) < 0; }).sort(byDateAsc).reverse();

    var html = "<div class='card'><div class='card-title'>" + esc(cat.label) + "</div>" +
        "<div class='card-sub'>" + esc(subj.name) + (subj.teacher ? " · " + esc(subj.teacher) : "") + "</div>" +
        "<div class='card-sub'>" + up.length + " upcoming · " + prev.length + " previous</div>";

    html += "<div class='sec'>Upcoming</div>";
    html += up.length ? up.map(function (i) { return itemRow(i); }).join("") : "<div class='empty'>Nothing upcoming.</div>";

    if (prev.length) {
        html += "<details><summary>Previous (" + prev.length + ")</summary>" +
            prev.map(function (i) { return itemRow(i); }).join("") + "</details>";
    }
    html += "<div class='btns'>" + optBtn("go s" + subj.id, "← Back") + optBtn("help", "🏠 Menu") + "</div></div>";
    return html;
}

function subjectMenu(subj) {
    var html = "<div class='card'><div class='card-title'>" + esc(subj.name) + "</div>";
    if (subj.teacher) html += "<div class='card-sub'>Teacher: " + esc(subj.teacher) + "</div>";
    if (!subj.cats.length) {
        html += "<div class='empty'>No lists yet.</div>";
    } else {
        html += "<div class='sec'>Lists</div>";
        subj.cats.forEach(function (c, i) {
            var up = upcomingOf(c);
            var line = up.length ? up.length + " upcoming · next " + whenText(dayDiff(up[0].date)).toLowerCase() : "Nothing upcoming";
            html += optCard("go c" + c.id, (i + 1) + ". " + c.label,
                "<span class='n'>" + (i + 1) + "</span><div><div class='t'>" + esc(c.label) + "</div>" +
                "<div class='d'>" + esc(line) + " · " + c.items.length + " total</div></div>");
        });
    }
    return html + "<div class='btns'>" + optBtn("help", "🏠 Menu") + "</div></div>";
}

function nextOverview() {
    var all = [];
    subjects.forEach(function (s) {
        s.cats.forEach(function (c) {
            c.items.forEach(function (i) { if (dayDiff(i.date) >= 0) all.push({ it: i, s: s, c: c }); });
        });
    });
    all.sort(function (x, y) { return byDateAsc(x.it, y.it); });
    all = all.slice(0, 8);
    var html = "<div class='card'><div class='card-title'>📅 What's next</div>" +
        "<div class='card-sub'>Closest deadlines across all subjects</div><div class='sec'>Upcoming</div>";
    html += all.length
        ? all.map(function (x) { return itemRow(x.it, x.s.name + " · " + x.c.label); }).join("")
        : "<div class='empty'>Nothing upcoming.</div>";
    return html + "<div class='btns'>" + optBtn("help", "🏠 Menu") + "</div></div>";
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
    greendiv.innerText = shown;
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

    var cmd = inputText.toLowerCase().trim();
    var K = subjects.length;
    var num = /^\d+$/.test(cmd) ? parseInt(cmd, 10) : 0;
    if (num >= 1 && num <= K) { sendTextMessage(subjectMenu(subjects[num - 1])); return; }
    var actions = ["clear"];
    if (num > K && num <= K + actions.length) cmd = actions[num - K - 1];

    switch (cmd) {
        case "intro":
            setTimeout(() => {
                sendTextMessage("<div class='card'><div class='card-title'>Welcome to " + esc(GROUP_NAME) + " 👋🏻</div>" +
                    "<div class='card-sub'>Tap a subject, or type its number or part of its name.</div>" + menuHtml() + "</div>");
            }, 800);
            return;
        case "help":
        case "menu":
        case "back":
            loadData().then(function () { showMenu(); });
            return;
        case "next":
            loadData().then(function () { sendTextMessage(nextOverview()); });
            return;
        case "clear":
            clearChat();
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
