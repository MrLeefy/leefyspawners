# 🟢 LeefySpawners v8.0.0

A high-performance, features-rich Mob Spawner management and stacking addon for **Minecraft: Bedrock Edition**. Built from the ground up to support single-player worlds, dedicated servers, and **Minecraft Realms** without requiring unstable Beta APIs.

---

## 🚀 Key Features

*   **⚡ Realms Compatible:** Built entirely using stable Script API modules (`@minecraft/server` and `@minecraft/server-ui`). Runs on Minecraft Realms out-of-the-box without requiring the "Beta APIs" experimental toggle.
*   **📊 Level Progression:** Upgrade spawners from Level 1 to 32, increasing spawn counts, spawning speeds, and maximum entity stack limits.
*   **🎯 Advanced Mob Stacking:** Automatically stacks nearby entities of the same type to optimize server performance and drastically reduce entity lag.
*   **🔐 Admin Control Center:** Manage the server's spawners via a secure GUI. Track player spawners, search spawners by radius or coordinates, and inspect server statistics.
*   **💾 Robust Persistence:** Uses a structured, dynamic save state system to store spawner coordinates, levels, and custom configuration settings reliably across server restarts.
*   **👾 30+ Supported Mobs:** Supports farm animals, hostiles, Nether creatures, aquatic life, golems, and boss mobs (including the Wither and Warden).

---

## 📋 Spawner Level Progression

As you upgrade your spawners, their stats scale dynamically:

| Spawner Level | Spawn Quantity | Spawn Interval | Max Stack Size |
| :--- | :--- | :--- | :--- |
| **Level 1–10** | 1 Mob | 15 Seconds | 100 Entities |
| **Level 11–20** | 2 Mobs | 12 Seconds | 300 Entities |
| **Level 21–30** | 3 Mobs | 9 Seconds | 500 Entities |
| **Level 31** | 4 Mobs | 6 Seconds | 700 Entities |
| **Level 32 (Max)** | 5 Mobs | 3 Seconds | 1000 Entities |

---

## 🎮 How to Use (Player Guide)

### 1. Placing a Spawner
*   Place a spawner block. It will start with default Level 1 parameters.
*   Right-click (or tap) a placed spawner to open the **Spawner Menu**.

### 2. Spawner Menu UI
Right-clicking any placed spawner opens the user interface with the following actions:
*   **Upgrade:** Consumes spawner items from your inventory to level up the spawner.
*   **Max Upgrade:** Automatically applies all compatible spawner items in your inventory to upgrade the spawner to its maximum possible level (up to Level 32).
*   **Downgrade:** Reduces the spawner's level and refunds the spawner items back to your inventory.
*   **Teleport Stack:** Teleports the spawner's stacked entities directly to the spawner's location.
*   **Instructions:** Opens an in-game summary of spawner mechanics.

### 3. Mob Stacking Mechanics
*   When a spawner spawns mobs, it checks the **Stacking Radius** (default: 50 blocks).
*   If an entity of the same type is already in the radius, they stack together. A floating name tag above the mob displays its current stack count (e.g., `[x42] Cow`).
*   Killing a stacked mob reduces its stack count by 1 and drops the appropriate loot and XP.

---

## 🛠️ Admin Configuration & Tools

Admins have access to powerful tools to maintain server performance and monitor players.

### 1. Granting Admin Privileges
To access the Admin features, you must have the `admin` tag. Run the following command in-game:
```mcfunction
/tag @s add admin
```

### 2. Admin GUI Control Panel
Once you have the `admin` tag, hold a **Blaze Rod** (or open the Spawner Menu and select the Admin Options) to open the control panel.

*   **🔍 Search by Location:** Locate spawners in loaded chunks. You can search around your current position or input manual X/Z coordinates with a custom radius (10–500 blocks). Teleport directly to search results.
*   **👥 Player List:** View all players on the server, how many spawners they have placed, and the total stacked entities. Select any player to view and teleport to their individual spawners.
*   **📈 Server Statistics:** View live server health metrics, total active spawners, total stacked mobs, and top killed mob types.
*   **⚙️ System Settings:** Modify global settings:
    *   *Stacking Radius:* Distance within which mobs will stack (default: 50 blocks).
    *   *Player Kill Only:* Toggle whether mob stacks can only be killed/reduced by players (prevents auto-farms from clearing stacks if desired).
    *   *Item/XP Drop Caps:* Limit the maximum number of items and XP orbs dropped per kill to prevent frame drops.

---

## 📦 Installation Guide

### Option A: Manual Installation (Local World / Dedicated Server)
1.  Download the `.mcaddon` file (or download the behavior and resource packs separately).
2.  **Windows/PC:** Double-click the `.mcaddon` file to automatically import it into Minecraft.
3.  **Dedicated Server:** 
    *   Place `JUN06LeefySpawners BEH` into the server's `behavior_packs` folder.
    *   Place `JUN06LeefySpawners RES` into the server's `resource_packs` folder.
    *   Add the pack UUIDs to your server's `world_behavior_packs.json` and `world_resource_packs.json`.

### Option B: Installing on Realms (Realms Compatible!)
Since LeefySpawners uses **stable Scripting API versions**, it is fully supported on Realms without needing "Beta APIs" turned on:
1.  Apply both the **LeefySpawners Behavior Pack** and **Resource Pack** to your local single-player world.
2.  Go to your Realm settings, select **Replace World**, and upload the world containing the LeefySpawners addon.
3.  Make sure that **Require players to accept resource packs to join** is enabled.

---

## 📂 Repository Structure

```
leefyspawners/
├── README.md                          # Repository documentation
├── .agent/
│   └── agent.md                       # Agent preferences and guidelines
├── JUN06LeefySpawners BEH/            # Behavior Pack
│   ├── manifest.json                  # Manifest file (Stable API dependencies)
│   ├── pack_icon.png                  # Pack icon
│   ├── scripts/
│   │   └── module/
│   │       ├── import.js              # Script loader
│   │       └── scripts/
│   │           ├── mobstacker-core.js # Spawner logic & entity stacking
│   │           ├── mobstacker-ui.js   # Client forms & UI menus
│   │           ├── levelsystem.js     # Upgrade/downgrade handler
│   │           ├── database.js        # Persistence database using dynamic properties
│   │           └── constants.js       # Global constants & configuration
│   └── [entities/blocks/items/loot_tables]
└── JUN06LeefySpawners RES/            # Resource Pack
    ├── manifest.json                  # Manifest file
    ├── pack_icon.png                  # Pack icon
    └── [textures/models/entity/texts]
```

---

## 🛠️ Technical Details for Developers

*   **API Version:** `@minecraft/server` v1.12.0, `@minecraft/server-ui` v1.2.0.
*   **Min Engine Version:** `1.20.0`
*   **Database Mechanism:** Custom persistent storage engine leveraging dynamic world properties to serialize spawner coordinate dictionaries.
*   **Low-Latency Scheduling:** Spawner ticking runs on optimized intervals rather than every game tick, minimizing impact on server TPS.
