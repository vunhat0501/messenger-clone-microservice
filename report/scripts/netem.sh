#!/bin/bash
# Inject latency or packet loss into a running container without touching its image or the app configuration.
# usage: netem.sh apply <container> <netem args...>   e.g. netem.sh apply app_redis delay 200ms loss 5%
#        netem.sh clear <container>
# Uses the local `netem-tools` image (alpine + iproute2) in the target's network namespace.
action="$1"; target="$2"; shift 2
case "$action" in
  apply) docker run --rm --net "container:$target" --cap-add NET_ADMIN netem-tools sh -c "tc qdisc del dev eth0 root 2>/dev/null; tc qdisc add dev eth0 root netem $*" ;;
  clear) docker run --rm --net "container:$target" --cap-add NET_ADMIN netem-tools sh -c "tc qdisc del dev eth0 root 2>/dev/null; true" ;;
  show)  docker run --rm --net "container:$target" --cap-add NET_ADMIN netem-tools tc qdisc show dev eth0 ;;
esac
