#!/bin/bash

# cleansend Protocol Test Flow
# This script demonstrates the complete cleansend protocol flow

echo "🚀 cleansend Protocol Test Flow (TypeScript)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

BASE_URL="http://localhost:3000/cleansend/sandbox"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to make HTTP requests and pretty print
make_request() {
    local method=$1
    local url=$2
    local data=$3
    local description=$4
    
    echo -e "\n${BLUE}📡 ${description}${NC}"
    echo "   ${method} ${url}"
    
    if [ -n "$data" ]; then
        echo "   Data: ${data}"
    fi
    
    echo -e "${YELLOW}   Response:${NC}"
    
    if [ -n "$data" ]; then
        response=$(curl -s -X $method "$url" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        response=$(curl -s -X $method "$url")
    fi
    
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    
    # Extract pass_code if this is a pass code request
    if [[ $description == *"pass code"* ]]; then
        PASS_CODE=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('pass_code', ''))" 2>/dev/null)
        if [ -n "$PASS_CODE" ]; then
            echo -e "${GREEN}   ✓ Pass code extracted: ${PASS_CODE}${NC}"
        fi
    fi
}

# Check if server is running
echo -e "\n${BLUE}🔍 Checking server status...${NC}"
health_response=$(curl -s "${BASE_URL%/openmsg/sandbox}/health" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}   ✓ Server is running${NC}"
else
    echo -e "${RED}   ❌ Server is not running. Please start it with 'npm run dev' or 'npm start'${NC}"
    exit 1
fi

# Step 1: Request pass code for user 0
make_request "POST" "$BASE_URL/setup/request-pass-code" \
    '{"self_openmsg_address": "0*localhost"}' \
    "Step 1: Request pass code for user 0*localhost"

if [ -z "$PASS_CODE" ]; then
    echo -e "${RED}❌ Failed to get pass code. Exiting.${NC}"
    exit 1
fi

# Step 2: Initiate handshake from user 1 to user 0
make_request "POST" "$BASE_URL/setup/initiate-handshake" \
    "{\"other_openmsg_address\": \"0*localhost\", \"pass_code\": \"$PASS_CODE\"}" \
    "Step 2: Initiate handshake from user 1*localhost to user 0*localhost"

# Step 3: Send message from user 1 to user 0
make_request "POST" "$BASE_URL/setup/send-message" \
    '{
        "message_text": "Hello from TypeScript OpenMsg! This is a test message.",
        "sending_openmsg_address": "1*localhost",
        "receiving_openmsg_address": "0*localhost"
    }' \
    "Step 3: Send message from user 1*localhost to user 0*localhost"

# Step 4: Send another message to test the connection
make_request "POST" "$BASE_URL/setup/send-message" \
    '{
        "message_text": "Second test message - connection is working!",
        "sending_openmsg_address": "1*localhost",
        "receiving_openmsg_address": "0*localhost"
    }' \
    "Step 4: Send second message to verify connection"

# Test info endpoint
make_request "GET" "$BASE_URL/info" "" \
    "Getting protocol information"

echo ""
echo -e "${GREEN}🎉 Test flow completed!${NC}"
echo ""
echo "Next steps:"
echo "- Check your database to see the stored messages in 'openmsg_messages_inbox'"
echo "- Try the same flow with different user addresses"
echo "- Test with real domain names when deploying to production"
echo ""
echo "Database tables to check:"
echo "- openmsg_user_connections (established connections)"
echo "- openmsg_messages_sent (sent messages)"  
echo "- openmsg_messages_inbox (received messages)" 