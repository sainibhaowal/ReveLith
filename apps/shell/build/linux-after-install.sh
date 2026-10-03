#!/bin/sh
# deb/rpm post-install: expose the revelith command line shipped inside the app.
# Only an absent name, a dead link or a link into our own install dir is taken
# over; anything else at /usr/bin/revelith belongs to another program (revelith#893).
set -e
launcher="/opt/ReveLith/resources/cli/revelith"
link="/usr/bin/revelith"
[ -x "$launcher" ] || exit 0
if [ -L "$link" ]; then
  case "$(readlink "$link")" in
    /opt/ReveLith/*) ;;
    *) [ -e "$link" ] && { echo "revelith: $link is another program, left as is; run: ln -s $launcher $link" >&2; exit 0; } ;;
  esac
elif [ -e "$link" ]; then
  echo "revelith: $link is another program, left as is; run: ln -s $launcher $link" >&2
  exit 0
fi
ln -sfn "$launcher" "$link"
exit 0
