#!/usr/bin/env bash
# Seeds a neutral, role-based example account for the demo clips.
# Run it against an empty account: it doesn't check for existing entries.
set -euo pipefail

uncola goal add "Earn the Professional Cloud Architect certification" --due 2026-12-15 --progress 70 --date 2026-09-08 \
  --desc "Learning path, two practice exams, then the exam"
uncola goal add "Publish 2 thought-leadership blog posts this quarter" --due 2026-12-31 --progress 40 --date 2026-10-01 \
  --desc "Posts on architecture and data, each with a worked example"
uncola goal add "Build an agent skill for a travel-expense app" --due 2026-11-30 --progress 25 --date 2026-10-05 \
  --desc "Let coding agents file and check expenses through the app's API"
uncola goal add "Present at the Chelsea NYC AI meetup" --due 2027-01-21 --progress 30 --date 2026-10-06 \
  --desc "A 20-minute talk with a live demo"
uncola goal add "Organize a fundraising 5K" --due 2026-11-15 --progress 50 --date 2026-09-20 \
  --desc "Charity run for the local food bank; goal of 100 runners"
uncola goal add "Mentor two junior engineers" --due 2027-03-31 --progress 60 --date 2026-09-01 \
  --desc "Biweekly sessions, design reviews and a stretch project each"

uncola log activity "Finished the certification learning path" --desc "All 9 modules, with labs on networking and security" \
  --goal certification --time 6h --skills "Cloud architecture" --date 2026-10-07
uncola log activity "Published blog post: Caching patterns for APIs" --desc "Read-through, write-behind and cache invalidation, with diagrams" \
  --goal "blog posts" --time 3h --skills "Architecture,Writing" --date 2026-10-08
uncola log achievement "Spoke at a customer summit on modernizing with containers" --desc "30-minute session for about 120 attendees" \
  --skills "Containers,Public speaking" --visibility team --date 2026-10-09
uncola log activity "Booked the park permit for the 5K" --desc "Route, date and insurance confirmed with the parks department" \
  --goal 5K --time 2h --skills "Event planning" --date 2026-10-12
uncola log activity "Mapped the travel-expense API for the agent skill" --desc "Endpoints for trips, receipts and approvals; auth flow" \
  --goal "agent skill" --time 3h --skills "APIs,AI agents" --date 2026-10-13
uncola log achievement "Ran a hands-on workshop for 30 engineers" --desc "Infrastructure as code from zero to a deployed service" \
  --skills "Teaching,Terraform" --date 2026-10-14
uncola log activity "Submitted the talk abstract to the Chelsea NYC AI meetup" --desc "Agents that use your tools: skills, CLIs and guardrails" \
  --goal Chelsea --time 1h --skills "Public speaking,AI agents" --date 2026-10-15
uncola log activity "Practice exam 1" --desc "Scored 74%; review hybrid connectivity and cost optimization" \
  --goal certification --time 2h --skills "Cloud architecture" --date 2026-10-16
uncola log activity "Design review with my mentee" --desc "Walked through an event-driven order service together" \
  --goal mentor --time 1h --skills "Mentoring,Architecture" --date 2026-10-19
uncola log activity "Drafted the agent skill's commands" --desc "File an expense, attach a receipt, check approval status" \
  --goal "agent skill" --time 2h30m --skills "AI agents,Writing" --date 2026-10-21
uncola log activity "40 runners signed up for the 5K" --desc "Sign-up page shared with three local running clubs" \
  --goal 5K --time 1h --skills "Event planning,Fundraising" --date 2026-10-22
uncola log 1on1 "Weekly with my manager" --with Alex --point "Certification exam date" --point "Meetup talk" \
  --action "Book the certification exam:2026-11-06" --notes "Aim to finish the certification before the 5K" --date 2026-10-23
