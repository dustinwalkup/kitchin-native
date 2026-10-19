#!/usr/bin/env bash
# Two simulators side by side for the live-update checks (specs/mvp/4-test-plan.md, MT-5-*).
# Boots "Kitchin A" and "Kitchin B", creating them the first time, installs the newest development
# build on both and opens it. Then prints the local sign-ins, and the docker commands that take the
# local Realtime container down and back up for the reconnect check (MT-5-07).
#
#   npm run two-sims
#
# Needs a development build from `npm run ios`, the local stack (`npx supabase start`) and Metro
# (`npm start`). Running it again reinstalls the newest build on the same two simulators.
#
# Overrides:
#   KITCHIN_APP=/path/to/KitchinDev.app   the build to install (default: the newest one in DerivedData)
#   KITCHIN_SIM_DEVICE="iPhone 17"        the model for new simulators (default: iPhone 16)
set -euo pipefail
shopt -s nullglob

cd "$(dirname "$0")/.."

SIMULATORS=("Kitchin A" "Kitchin B")
DEVICE="${KITCHIN_SIM_DEVICE:-iPhone 16}"
SEED=supabase/seed/10_seed_data.sql

die() {
  printf 'two-sims: %s\n' "$*" >&2
  exit 1
}

command -v xcrun >/dev/null || die "xcrun not found. Install Xcode and select it with xcode-select."
command -v node >/dev/null || die "node not found."

# The development build. `expo run:ios` builds the "KitchinDev" scheme into Xcode's DerivedData.
app="${KITCHIN_APP:-}"
if [[ -z "$app" ]]; then
  builds=("$HOME"/Library/Developer/Xcode/DerivedData/KitchinDev-*/Build/Products/Debug-iphonesimulator/KitchinDev.app)
  ((${#builds[@]})) || die "no development build found. Run \`npm run ios\` first."
  app=$(ls -dt "${builds[@]}" | sed -n 1p)
fi
[[ -f "$app/Info.plist" ]] || die "$app isn't a simulator app build."
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist")

# The UDID of the available simulator with this name, or nothing.
udid_of() {
  xcrun simctl list devices available -j | node -e '
    const { devices } = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const device = Object.values(devices).flat().find((d) => d.name === process.argv[1]);
    if (device) console.log(device.udid);
  ' "$1"
}

# The newest installed iOS runtime that offers $DEVICE.
newest_runtime() {
  xcrun simctl list runtimes available -j | node -e '
    const { runtimes } = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const parts = (version) => version.split(".").map(Number);
    const newer = (a, b) => {
      const [x, y] = [parts(a.version), parts(b.version)];
      for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
      }
      return 0;
    };
    const [runtime] = runtimes
      .filter((r) => r.platform === "iOS" && r.supportedDeviceTypes.some((t) => t.name === process.argv[1]))
      .sort(newer);
    if (runtime) console.log(runtime.identifier);
  ' "$DEVICE"
}

metro_running() {
  [[ $(curl -s --max-time 2 http://localhost:8081/status || true) == "packager-status:running" ]]
}

# A simulator that has only just booted can refuse a launch ("No such process") for a few seconds.
launch() {
  local attempt
  for attempt in 1 2 3 4 5; do
    xcrun simctl launch --terminate-running-process "$1" "$bundle_id" >/dev/null 2>&1 && return
    sleep 3
  done
  xcrun simctl launch --terminate-running-process "$1" "$bundle_id" >/dev/null
}

printf 'Installing %s\n  built %s\n\n' "$app" "$(stat -f '%Sm' "$app")"

udids=()
for name in "${SIMULATORS[@]}"; do
  udid=$(udid_of "$name")
  if [[ -z "$udid" ]]; then
    runtime=$(newest_runtime)
    [[ -n "$runtime" ]] || die "no installed iOS runtime offers \"$DEVICE\". Set KITCHIN_SIM_DEVICE."
    printf 'Creating "%s" (%s, %s)\n' "$name" "$DEVICE" "${runtime##*.}"
    udid=$(xcrun simctl create "$name" "$DEVICE" "$runtime")
  fi
  printf 'Booting "%s"\n' "$name"
  # Boots it unless it's booted already, and waits until it has finished.
  xcrun simctl bootstatus "$udid" -b >/dev/null
  xcrun simctl install "$udid" "$app"
  udids+=("$udid")
done

open -a Simulator

# A development build loads its JavaScript from Metro, so there's nothing to open without it.
if metro_running; then
  for udid in "${udids[@]}"; do
    launch "$udid"
  done
  printf '\nKitchin Dev is open on both.\n'
else
  printf '\nMetro isn'\''t running. Start it with `npm start`, then open Kitchin Dev on each simulator.\n'
fi

# "member-a@example.com   member-a-local-only   Household One", from the seed file's header.
account() {
  awk -v email="member-$1@example.com" '
    $1 == "--" && $2 == email { household = $4; for (i = 5; i <= NF; i++) household = household " " $i
                                printf "%s / %s   (%s)", $2, $3, household; exit }
  ' "$SEED"
}

project_id=$(sed -n 's/^project_id = "\(.*\)"$/\1/p' supabase/config.toml)
realtime="supabase_realtime_${project_id}"

cat <<EOF

Sign in with the local seed accounts ($SEED):
  Kitchin A   $(account a)
  Kitchin B   $(account b)
  MT-5-10: sign out on Kitchin B and use $(account c)

Reconnect check (MT-5-07), from another terminal:
  docker stop $realtime     drops live updates
  docker start $realtime    brings them back
Stopping closes the socket, so "Reconnecting…" shows about 3 s later. To stall the connection
instead, with the socket left open, use docker pause and docker unpause. The app notices a stall
only when a heartbeat goes unanswered, 25 to 50 s later.

When you're done:
  xcrun simctl shutdown "${SIMULATORS[0]}"; xcrun simctl shutdown "${SIMULATORS[1]}"
EOF
