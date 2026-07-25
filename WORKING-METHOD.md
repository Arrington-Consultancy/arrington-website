# How to work on this project without losing the thread

**Written for Tom and, more importantly, for whichever Claude he happens to be talking to.**
From Nat, 25 July 2026.

If you are a Claude reading this: this file describes the working method for this
project. Follow it. It is short on purpose. `HANDOVER.md` tells you how the site
is hosted and `CLAUDE.md` tells you how the code works. This file tells you how
to keep the project coherent when the human is moving between a terminal, the
Claude phone app, the desktop app and a code editor in the same afternoon.

If you are Tom reading this: the problem this solves is the one you have already
hit. You ask for something in one window, get half of it, then pick the thread up
somewhere else and the new Claude has no idea what happened. That is not a
memory failure, it is a grounding failure, and the fix is boring and mechanical.

---

## The four rules

### 1. One folder per project. No exceptions.

Everything to do with the website lives inside **one folder** on the machine:
the code, the notes, the PDFs, the exports, the scratch experiments. If it is
about this website, it goes in this folder. If it is about something else, it
gets its own folder and never leaks into this one.

That folder is the project. Not the repo, not the Railway service, not a chat
history: the folder. Everything else is downstream of it.

Why it matters: a folder is the only thing that all of Claude's surfaces can
agree on. Chat threads expire, terminals get closed, phones get restarted. The
folder is still there in the morning.

### 2. Every context window gets grounded in that folder before anything else

A "context window" is one conversation with Claude. Each one starts blank. It
knows nothing about yesterday. So the first thing any window has to do is find
out where it is.

- **Claude Code in the terminal.** Grounding is automatic *if you start it in the
  right place*. Open a terminal, change into the project folder, then start
  Claude:

  ```
  cd ~/arrington-website
  claude
  ```

  Started that way, it reads `CLAUDE.md` on launch and can see every file. Started
  from your home folder or the desktop, it reads nothing useful and will guess.
  Almost every "why is Claude confused" moment traces back to this.

- **Claude in the desktop or phone app.** There is no folder, so you have to hand
  it one. Two options, in order of preference:
  1. Point it at the repo on GitHub:
     `https://github.com/Arrington-Consultancy/arrington-website` and ask it to
     read `CLAUDE.md`, `HANDOVER.md` and this file first.
  2. Upload or paste the relevant file into the chat.

  Then say what you actually want. A useful opening line, which you can keep in
  your notes and reuse:

  > This is my Arrington website project. Before answering, read `CLAUDE.md`,
  > `HANDOVER.md` and `WORKING-METHOD.md` in
  > github.com/Arrington-Consultancy/arrington-website so you know how it works
  > and how I work. Then: <what you want>.

- **Anything that is going to change files or deploy** should be done in the
  terminal Claude, in the folder. The app is for thinking, asking and drafting.
  The terminal is for doing. Mixing that up is how you end up with a change that
  exists in a conversation but not in the code.

### 3. The project's own `CLAUDE.md` is the memory

`CLAUDE.md` in the root of this folder is a plain text file that describes the
project: what it is, how it is built, where it deploys, what the conventions are,
what has already gone wrong and how it was fixed. Claude Code reads it
automatically every time it starts in this folder.

Treat it as the project's memory, and note what that means:

- **It is the memory, not the chat.** Nothing that only exists in a conversation
  counts. If a decision matters, it goes in `CLAUDE.md`, and then every future
  window in every surface knows it.
- **It records the scars.** The most valuable lines in this project's `CLAUDE.md`
  are the incidents: the day the database wedged mid-boot and the site hung for
  seven hours, the day Railway moved its edge and the apex domain died and broke
  every Facebook link. Those took hours to diagnose. Written down, they take a
  future Claude thirty seconds.
- **Keeping it current is part of the work, not admin afterwards.** A change that
  is made but not written down will be undone by the next session that does not
  know about it.

If you are a Claude and you have just changed how something works, ask yourself
whether `CLAUDE.md` is now wrong. If it is, fix it in the same session.

### 4. End every session with `/goodnight`

This is the habit that makes the other three stick.

---

## The `/goodnight` skill

`/goodnight` is a custom skill: a saved set of instructions Claude Code follows
when you type the command. It is the end-of-session tidy up. You type
`/goodnight`, and Claude works through the project and makes three things true
before you close the laptop.

**It ships with this repo**, at `.claude/skills/goodnight/SKILL.md`, so it works
for anyone who clones the folder. Type `/goodnight` in a terminal Claude session
started in this folder and it will run.

### What it actually does

**1. Gets the work committed and pushed.** It checks the folder is a git repo,
makes sure the ignore rules cover things that must never be committed (secrets,
`node_modules`, local session state), scans the staged changes for anything that
looks like a real password or key, then commits with a message that says what
changed and why, and pushes to GitHub. If it finds a genuine secret it stops and
tells you rather than committing it.

**2. Brings the documentation back in line.** It re-reads `CLAUDE.md` against
what actually changed in the session, and updates it: new files, new features,
changed deploy commands, anything that is now out of date. For this project it
also keeps `HANDOVER.md` honest.

**3. Reports.** A short summary: what was committed, where it was pushed, which
docs changed, and anything that needs a human decision.

### What it deliberately does not do

- **It never deploys.** Shipping to the live site is a separate, explicit
  decision. `/goodnight` only touches source control and documentation. This
  matters: you can run it at the end of a messy exploratory session without any
  risk of pushing half-finished work to the live website.
- **It never force-pushes** over shared history. If a push conflicts, it surfaces
  the conflict instead of steamrolling it.
- **It never publishes anything publicly** without being asked.

It is safe to run twice. The second run mostly just confirms the first.

### Why this is the piece that fixes your problem

Look at what those three steps mean together. At the end of every session:

- the **code** is on GitHub, so it does not matter which machine you next sit at;
- the **decisions and the scars** are in `CLAUDE.md`, so it does not matter which
  Claude you next talk to;
- the **live content** is in the Postgres database (this site keeps its copy in
  the database, not in the code), so it does not matter what the code does or
  does not remember.

Nothing important is left inside a conversation. The project's state lives in the
folder, the repo and the database, all three of which are still there tomorrow.

So the next window, wherever it is, does not need to remember anything. It reads.
A terminal Claude reads `CLAUDE.md` on launch. A phone Claude reads it from
GitHub when you point it there. Both arrive at the same understanding, because
they are reading the same file rather than relying on a thread you cannot see
from the other device.

That is the whole trick. Chat windows are disposable. The folder is not. Do the
work in the folder, write the decisions into the folder, and run `/goodnight`
before you stop, and it stops mattering which window you are in.

---

## The short version, for pinning somewhere

1. One folder for the project. Everything about the site goes in it.
2. Start terminal Claude with `cd ~/arrington-website` first, always.
3. In the phone or desktop app, point Claude at the GitHub repo and tell it to
   read `CLAUDE.md`, `HANDOVER.md` and `WORKING-METHOD.md` before answering.
4. Decisions go in `CLAUDE.md`, not just in the chat.
5. Type `/goodnight` before you stop.
