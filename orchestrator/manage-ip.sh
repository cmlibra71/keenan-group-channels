#!/bin/bash
#
# Manage Elastic IPs for sites (optional - sites share the host IP by default).
#
# Usage:
#   ./orchestrator/manage-ip.sh allocate <site-name>    # Allocate a new Elastic IP
#   ./orchestrator/manage-ip.sh release <site-name>     # Release the Elastic IP
#   ./orchestrator/manage-ip.sh list                     # List all allocations
#
# Requires: aws CLI configured with appropriate permissions.
#

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IP_MAP="$ROOT/orchestrator/.ip-allocations.json"

# Ensure the IP map file exists
[ -f "$IP_MAP" ] || echo '{}' > "$IP_MAP"

case "${1:-}" in
  allocate)
    SITE_NAME="${2:?Site name required}"
    echo "Allocating Elastic IP for $SITE_NAME..."

    # Allocate EIP
    ALLOC=$(aws ec2 allocate-address --domain vpc --output json)
    ALLOC_ID=$(echo "$ALLOC" | python3 -c "import sys,json; print(json.load(sys.stdin)['AllocationId'])")
    PUBLIC_IP=$(echo "$ALLOC" | python3 -c "import sys,json; print(json.load(sys.stdin)['PublicIp'])")

    echo "  Allocated: $PUBLIC_IP ($ALLOC_ID)"

    # Get this instance's ID
    INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo "")
    if [ -n "$INSTANCE_ID" ]; then
      # Associate with this instance
      aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID"
      echo "  Associated with instance $INSTANCE_ID"
    else
      echo "  Warning: Not running on EC2, skipping association."
    fi

    # Save to map
    python3 -c "
import json
with open('$IP_MAP', 'r') as f:
    data = json.load(f)
data['$SITE_NAME'] = {'allocation_id': '$ALLOC_ID', 'public_ip': '$PUBLIC_IP'}
with open('$IP_MAP', 'w') as f:
    json.dump(data, f, indent=2)
"
    echo "  Saved to $IP_MAP"
    echo ""
    echo "  Point your DNS for $SITE_NAME to: $PUBLIC_IP"
    ;;

  release)
    SITE_NAME="${2:?Site name required}"
    echo "Releasing Elastic IP for $SITE_NAME..."

    ALLOC_ID=$(python3 -c "
import json
with open('$IP_MAP', 'r') as f:
    data = json.load(f)
print(data.get('$SITE_NAME', {}).get('allocation_id', ''))
")

    if [ -z "$ALLOC_ID" ]; then
      echo "  No allocation found for $SITE_NAME"
      exit 1
    fi

    # Disassociate and release
    aws ec2 release-address --allocation-id "$ALLOC_ID" 2>/dev/null || true
    echo "  Released: $ALLOC_ID"

    # Remove from map
    python3 -c "
import json
with open('$IP_MAP', 'r') as f:
    data = json.load(f)
data.pop('$SITE_NAME', None)
with open('$IP_MAP', 'w') as f:
    json.dump(data, f, indent=2)
"
    ;;

  list)
    echo "IP Allocations:"
    python3 -c "
import json
with open('$IP_MAP', 'r') as f:
    data = json.load(f)
if not data:
    print('  (none - all sites sharing host IP)')
else:
    for site, info in data.items():
        print(f'  {site}: {info[\"public_ip\"]} ({info[\"allocation_id\"]})')
"
    ;;

  *)
    echo "Usage: $0 {allocate|release|list} [site-name]"
    exit 1
    ;;
esac
