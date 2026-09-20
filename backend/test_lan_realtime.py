import asyncio
import json
import websockets
import urllib.request

API_BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000/ws/location/OFFICER-TEST-01"

async def test_end_to_end_geofence_realtime():
    events_received = []

    async with websockets.connect(WS_URL) as ws:
        # Read handshake response
        handshake = await ws.recv()
        print("Handshake response:", json.loads(handshake).get("type"))

        async def run_http_ops():
            await asyncio.sleep(0.5)

            # 1. Create Geofence
            req = urllib.request.Request(
                f"{API_BASE_URL}/api/geofences",
                data=json.dumps({
                    "name": "LAN Physical Device Test Zone",
                    "department": "Field Operations",
                    "description": "LAN Integration Perimeter",
                    "center_latitude": 11.0168,
                    "center_longitude": 76.9558,
                    "radius_meters": 350.0
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            res = json.loads(urllib.request.urlopen(req).read().decode())
            geo_id = res["geofence"]["id"]
            print("Created Geofence ID:", geo_id)

            await asyncio.sleep(0.5)

            # 2. Update Geofence
            update_req = urllib.request.Request(
                f"{API_BASE_URL}/api/geofences/{geo_id}",
                data=json.dumps({
                    "name": "LAN Physical Device Test Zone Updated",
                    "radius_meters": 450.0
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="PUT"
            )
            urllib.request.urlopen(update_req)
            print("Updated Geofence ID:", geo_id)

            await asyncio.sleep(0.5)

            # 3. Delete Geofence
            del_req = urllib.request.Request(
                f"{API_BASE_URL}/api/geofences/{geo_id}",
                method="DELETE"
            )
            urllib.request.urlopen(del_req)
            print("Deleted Geofence ID:", geo_id)

        ops_task = asyncio.create_task(run_http_ops())

        while len(events_received) < 3:
            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
            parsed = json.loads(msg)
            evt = parsed.get("type") or parsed.get("event")
            print("WS Broadcast Event:", evt)
            if evt in ("GEOFENCE_CREATED", "GEOFENCE_UPDATED", "GEOFENCE_DELETED"):
                events_received.append(evt)

        await ops_task

    print("Captured Events:", events_received)
    assert "GEOFENCE_CREATED" in events_received
    assert "GEOFENCE_UPDATED" in events_received
    assert "GEOFENCE_DELETED" in events_received
    print("ALL REALTIME GEOFENCE TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(test_end_to_end_geofence_realtime())
