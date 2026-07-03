# LeefySpawners BEH - Complete Usage Guide

## 📋 Overview

LeefySpawners BEH is a comprehensive mob spawner management addon for Minecraft Bedrock Edition that allows players to place, upgrade, and manage mob spawners with advanced stacking and leveling systems.

## 🚀 Quick Start

1. **Place a Spawner**: Right-click with a spawner item to place it
2. **Upgrade Spawners**: Use spawner items in your inventory to upgrade existing spawners
3. **Admin Commands**: Use the admin interface for advanced management

## 📊 Core Features

### 🎯 Spawner System
- **Place spawners** that automatically generate mobs
- **Stack entities** for efficient mob management
- **Level progression** from 1-32 with increasing power
- **Configurable loot drops** from killed entities

### ⚡ Level Progression
| Level Range | Spawn Quantity | Spawn Speed | Max Stack Size |
|-------------|----------------|-------------|----------------|
| 1-10 | 1 entity | 15 seconds | 100 entities |
| 11-20 | 2 entities | 12 seconds | 300 entities |
| 21-30 | 3 entities | 9 seconds | 500 entities |
| 31 | 4 entities | 6 seconds | 700 entities |
| **32** | **5 entities** | **3 seconds** | **1000 entities** |

## 🎮 User Interface Guide

### 🏠 Main Spawner Interface
**Access**: Right-click any placed spawner

**Options:**
- **Upgrade**: Consume spawner items to increase level
- **Max Upgrade**: Upgrade to level 32 using all available spawners
- **Downgrade**: Convert spawner (level 2+) back to items for refund
- **Teleport Stack**: Move entity stack to spawner location
- **Instructions**: View usage guide
- **Close**: Exit interface

### 🔍 Location Search Form
**Access**: Admin → "Search by Location"

**Features:**
- **Use Current Location**: Toggle to search from your position
- **Manual Coordinates**: Enter specific X/Z coordinates
- **Search Radius**: 10-500 blocks (default: 50)
- **Include Inactive**: Show spawners with no active entities

**Usage:**
1. Toggle "Use current location" or enter coordinates
2. Set search radius
3. Click search to find nearby spawners
4. Click any result to teleport there

### 👥 Player List Form
**Access**: Admin → "Player List"

**Features:**
- View all players with spawners
- See spawner counts and entity totals
- Teleport to player spawners
- Organized by most active players first

### 📈 Statistics Form
**Access**: Admin → "View All Statistics"

**Information:**
- Total spawners and entities
- Top killed mob types
- Player statistics and rankings
- System performance metrics

## 🔐 Permissions & Access

### Required Permissions

#### Player Permissions
- **Place Spawners**: No special permissions required
- **Upgrade Spawners**: Must have spawner items in inventory
- **Use Spawner Interfaces**: No permissions required

#### Admin Permissions
**Required Tag**: `admin`

**Admin Features:**
- Location search and teleportation
- Player spawner management
- Statistics viewing
- System configuration

### How to Grant Admin Access
```
/tag @s add admin
```

## 🛠️ Admin Commands

### Location Search
1. Open admin interface (hold blaze rod if admin)
2. Click "Search by Location"
3. Enter coordinates or use current location
4. Set search radius
5. View and teleport to found spawners

### Player Management
1. Open admin interface
2. Click "Player List"
3. Browse players by activity level
4. Click player to view their spawners
5. Teleport to specific spawner locations

### Statistics Monitoring
1. Open admin interface
2. Click "View All Statistics"
3. Monitor system performance
4. View top players and mob types

## ⚙️ Configuration

### Spawner Settings
- **Stack Radius**: Distance for entity stacking (default: 50 blocks)
- **Player Kill Only**: Only count kills from players (default: false)
- **Item Drop Cap**: Max items from spawner kills (default: 5)
- **XP Drop Cap**: Max XP orbs from spawner kills (default: 3)

### Entity Types Supported
- **Farm Animals**: Cow, Sheep, Pig, Chicken
- **Hostile Mobs**: Zombie, Skeleton, Creeper, Spider, Enderman
- **Nether Mobs**: Blaze, Wither Skeleton, Magma Cube
- **Boss Mobs**: Wither, Warden, Ravager
- **Golems**: Iron, Diamond, Gold, Emerald, Netherite
- **Aquatic**: Guardian
- **Special**: Shulker, Vindicator, Piglin Brute, Breeze

## 🚨 Troubleshooting

### Common Issues

**Spawner not spawning entities:**
- Ensure spawner is placed on valid surface
- Check if area is loaded (within 128 blocks)
- Verify spawner level settings in database

**Upgrade not working:**
- Must have spawner items in inventory
- Spawner must be at valid location
- Check console for error messages

**Location search not finding spawners:**
- Increase search radius
- Check if spawners are in loaded chunks
- Verify database integrity

**Permission errors:**
- Ensure admin tag is applied correctly
- Check if using correct admin interface

### Debug Commands
- Enable logging: Use admin interface logging toggle
- Check performance: View statistics in admin panel
- Monitor memory: Check system performance metrics

## 📋 Technical Details

### Database Structure
- **SpawnerLocations**: Stores all placed spawner data
- **AAValues**: Attack/Spawn values per level range
- **ConfigValues**: System configuration settings
- **XPDropValues**: XP drop configurations per entity

### Performance Features
- **Memory Management**: Automatic cleanup of old data
- **Chunk Processing**: Spatial optimization for large worlds
- **Entity Limits**: Prevents server overload
- **Statistics Tracking**: Comprehensive monitoring

### File Structure
```
LeefySpawners BEH/
├── manifest.json          # Addon configuration
├── scripts/
│   └── module/
│       ├── import.js      # Module initialization
│       └── scripts/
│           ├── mobstacker-core.js    # Main spawner logic
│           ├── mobstacker-ui.js      # User interfaces
│           ├── levelsystem.js        # Spawner upgrades
│           ├── database.js           # Data persistence
│           ├── VectorMath/           # Utility classes
│           └── constants.js          # Configuration values
```

## 🎯 Best Practices

### For Players
1. **Start Small**: Begin with level 1-10 spawners
2. **Strategic Placement**: Place spawners in safe, loaded areas
3. **Resource Management**: Monitor entity counts to prevent lag
4. **Regular Upgrades**: Use collected spawners to improve efficiency

### For Server Admins
1. **Monitor Performance**: Use statistics panel regularly
2. **Configure Settings**: Adjust stack radius and limits as needed
3. **Database Maintenance**: Monitor database sizes
4. **Player Management**: Use admin tools for server management

## 🔄 Update Notes

### Recent Improvements
- **Memory Optimization**: Improved memory management and cleanup
- **UI Enhancements**: Better distance display and level formatting
- **Bug Fixes**: Resolved spawner upgrade and entity parsing issues
- **Performance Monitoring**: Enhanced system health tracking

### Version Compatibility
- **Minecraft Version**: 1.20.0+
- **API Requirements**: Server API 2.3.0-beta, Admin API 1.0.0-beta, UI API 2.1.0-beta

---

*For technical support or feature requests, please check the addon files or contact the developer.*
