/**
 * Metadata Service - Usage Examples
 * Demonstrates how to use the MetadataService for intelligent department/topic lookup
 */

import { MetadataService } from '../src/core/services/MetadataService.js';
import { MySQLTicketRepository } from '../src/infrastructure/database/MySQLTicketRepository.js';
import { DatabaseConnectionManager } from '../src/infrastructure/database/DatabaseConnectionManager.js';
import { SSHTunnelPool } from '../src/infrastructure/ssh/SSHTunnelPool.js';

async function main() {
  // Initialize infrastructure (same as in production)
  const tunnelPool = new SSHTunnelPool(
    {
      host: process.env.SSH_HOST || 'localhost',
      port: parseInt(process.env.SSH_PORT || '22'),
      username: process.env.SSH_USER || 'user',
      privateKeyPath: process.env.SSH_KEY_PATH || '~/.ssh/id_rsa',
    },
    {
      maxConnections: 3,
      idleTimeout: 30000,
      healthCheckInterval: 60000,
    }
  );

  const dbManager = new DatabaseConnectionManager(
    tunnelPool,
    {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      database: process.env.DB_NAME || 'osticket',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      connectionLimit: 10,
      queueLimit: 20,
    }
  );

  await dbManager.connect();

  // Initialize repository and service
  const repository = new MySQLTicketRepository(dbManager, 'ost_');
  const metadataService = new MetadataService(repository);

  console.log('=== Metadata Service Examples ===\n');

  // ========================================
  // Example 1: List all departments
  // ========================================
  console.log('1. Liste aller Departments:\n');
  const departments = await metadataService.getDepartments();
  departments
    .filter(d => d.isActive)
    .slice(0, 5)
    .forEach(dept => {
      console.log(`  - ID ${dept.id}: "${dept.path}"`);
    });
  console.log(`  ... (${departments.length} total)\n`);

  // ========================================
  // Example 2: List all help topics
  // ========================================
  console.log('2. Liste aller Help Topics:\n');
  const topics = await metadataService.getHelpTopics();
  topics
    .filter(t => t.isActive)
    .slice(0, 5)
    .forEach(topic => {
      console.log(`  - ID ${topic.id}: "${topic.name}"`);
    });
  console.log(`  ... (${topics.length} total)\n`);

  // ========================================
  // Example 3: Exact department match
  // ========================================
  console.log('3. Exakter Department-Match:\n');
  try {
    const dept = await metadataService.findDepartmentByName('Support');
    console.log(`  ✓ Gefunden: ID ${dept.id} - "${dept.path}"\n`);
  } catch (error) {
    console.error(`  ✗ Fehler: ${error}\n`);
  }

  // ========================================
  // Example 4: Fuzzy department match
  // ========================================
  console.log('4. Fuzzy Department-Match (case-insensitive):\n');
  try {
    const dept = await metadataService.findDepartmentByName('support');
    console.log(`  ✓ "support" → ID ${dept.id} - "${dept.path}"\n`);
  } catch (error) {
    console.error(`  ✗ Fehler: ${error}\n`);
  }

  // ========================================
  // Example 5: Partial path match
  // ========================================
  console.log('5. Partial Path-Match:\n');
  try {
    const dept = await metadataService.findDepartmentByName('Projekte / OXID');
    console.log(`  ✓ "Projekte / OXID" → ID ${dept.id} - "${dept.path}"\n`);
  } catch (error) {
    console.error(`  ✗ Fehler: ${error}\n`);
  }

  // ========================================
  // Example 6: Topic exact match
  // ========================================
  console.log('6. Exakter Topic-Match:\n');
  try {
    const topic = await metadataService.findTopicByName('Feature Request');
    console.log(`  ✓ "Feature Request" → ID ${topic.id} - "${topic.name}"\n`);
  } catch (error) {
    console.error(`  ✗ Fehler: ${error}\n`);
  }

  // ========================================
  // Example 7: Topic alias match
  // ========================================
  console.log('7. Topic Alias-Match:\n');
  try {
    const topic = await metadataService.findTopicByName('Bug');
    console.log(`  ✓ "Bug" (alias) → ID ${topic.id} - "${topic.name}"\n`);
  } catch (error) {
    console.error(`  ✗ Fehler: ${error}\n`);
  }

  // ========================================
  // Example 8: Department not found (error handling)
  // ========================================
  console.log('8. Department nicht gefunden (Error-Handling):\n');
  try {
    await metadataService.findDepartmentByName('NonExistent Department');
    console.log('  ✗ Unexpected: Should have thrown error\n');
  } catch (error) {
    if (error instanceof Error) {
      console.log('  ✓ Error korrekt geworfen:');
      console.log(`    ${error.message.split('\n')[0]}`);
      console.log('    (siehe Error-Message für vollständige Department-Liste)\n');
    }
  }

  // ========================================
  // Example 9: Topic not found (error handling)
  // ========================================
  console.log('9. Topic nicht gefunden (Error-Handling):\n');
  try {
    await metadataService.findTopicByName('NonExistent Topic');
    console.log('  ✗ Unexpected: Should have thrown error\n');
  } catch (error) {
    if (error instanceof Error) {
      console.log('  ✓ Error korrekt geworfen:');
      console.log(`    ${error.message.split('\n')[0]}`);
      console.log('    (siehe Error-Message für vollständige Topic-Liste)\n');
    }
  }

  // ========================================
  // Example 10: Cache behavior
  // ========================================
  console.log('10. Cache-Verhalten:\n');

  // First call - loads from DB
  console.time('  First call (DB query)');
  await metadataService.getDepartments();
  console.timeEnd('  First call (DB query)');

  // Second call - uses cache
  console.time('  Second call (from cache)');
  await metadataService.getDepartments();
  console.timeEnd('  Second call (from cache)');

  // Clear cache
  metadataService.clearCache();
  console.log('\n  ✓ Cache cleared\n');

  // Third call - loads from DB again
  console.time('  Third call (DB query after clear)');
  await metadataService.getDepartments();
  console.timeEnd('  Third call (DB query after clear)');

  console.log('\n');

  // ========================================
  // Example 11: Real-world use case simulation
  // ========================================
  console.log('11. Real-World Use Case Simulation:\n');
  console.log('  User sagt: "Erstelle Ticket in Sitemap als Feature"\n');

  try {
    // Resolve department
    const dept = await metadataService.findDepartmentByName('Sitemap');
    console.log(`  → Department resolved: ID ${dept.id} - "${dept.path}"`);

    // Resolve topic
    const topic = await metadataService.findTopicByName('Feature');
    console.log(`  → Topic resolved: ID ${topic.id} - "${topic.name}"`);

    console.log('\n  ✓ Ready to create ticket with:');
    console.log(`    departmentId: ${dept.id}`);
    console.log(`    topicId: ${topic.id}\n`);
  } catch (error) {
    console.error(`  ✗ Error: ${error}\n`);
  }

  // Cleanup
  await dbManager.disconnect();
  await tunnelPool.shutdown();
  console.log('=== Examples completed ===\n');
}

// Run examples
main().catch(error => {
  console.error('Error running examples:', error);
  process.exit(1);
});
