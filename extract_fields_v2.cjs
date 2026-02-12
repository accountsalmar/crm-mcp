const xmlrpc = require('xmlrpc');
const fs = require('fs');

const config = {
  url: 'https://duracubeuat.com.au',
  db: '25_04_07',
  username: 'kasun.jayasinghe@duracube.com.au',
  password: '9b8391d2bac4c6c9d9085b112b808a7801a83321'
};

const commonClient = xmlrpc.createSecureClient({
  host: 'duracubeuat.com.au',
  port: 443,
  path: '/xmlrpc/2/common',
  headers: { 'Content-Type': 'text/xml' }
});

commonClient.methodCall('authenticate', [config.db, config.username, config.password, {}], (err, uid) => {
  if (err || uid === false) {
    console.error('Auth failed');
    return;
  }

  console.log('Authenticated. Starting extraction...');

  const objectClient = xmlrpc.createSecureClient({
    host: 'duracubeuat.com.au',
    port: 443,
    path: '/xmlrpc/2/object',
    headers: { 'Content-Type': 'text/xml' }
  });

  // First, get all models to build a lookup table
  console.log('Step 1: Fetching all models for lookup...');

  objectClient.methodCall('execute_kw', [
    config.db, uid, config.password,
    'ir.model', 'search_read', [[]],
    { fields: ['id', 'model', 'name'], limit: 2000 }
  ], (err, models) => {
    if (err) {
      console.error('Error fetching models:', err.message);
      return;
    }

    console.log('Fetched', models.length, 'models');

    const modelLookup = {};
    models.forEach(m => {
      modelLookup[m.model] = { id: m.id, name: m.name };
    });

    // Fetch all fields with relation_field
    console.log('Step 2: Fetching all fields...');

    objectClient.methodCall('execute_kw', [
      config.db, uid, config.password,
      'ir.model.fields', 'search_count', [[]]
    ], (err, totalCount) => {
      if (err) {
        console.error('Error counting fields:', err.message);
        return;
      }

      console.log('Total fields:', totalCount);

      const batchSize = 1000;
      const batches = Math.ceil(totalCount / batchSize);
      let allFields = [];
      let completed = 0;

      function fetchBatch(offset) {
        objectClient.methodCall('execute_kw', [
          config.db, uid, config.password,
          'ir.model.fields', 'search_read', [[]],
          {
            fields: ['id', 'name', 'field_description', 'model_id', 'model', 'ttype', 'relation', 'relation_field', 'relation_table', 'column1', 'column2', 'store', 'required', 'readonly'],
            offset: offset,
            limit: batchSize,
            order: 'model, name'
          }
        ], (err, fields) => {
          if (err) {
            console.error('Error fetching batch:', err.message);
            return;
          }

          allFields = allFields.concat(fields);
          completed++;
          console.log('Batch', completed, '/', batches, '- Total:', allFields.length);

          if (completed < batches) {
            fetchBatch(offset + batchSize);
          } else {
            saveResults(allFields, modelLookup);
          }
        });
      }

      function saveResults(fields, modelLookup) {
        console.log('\nStep 3: Processing and saving...');

        // Create CSV with comprehensive relationship info
        let csv = 'Field_ID,Field_Name,Field_Label,Field_Type,Model_ID,Model_Name,Related_Model,Related_Model_ID,Relation_Field,Relation_Table,Column1,Column2,Primary_Data_Location,Stored\n';

        fields.forEach(f => {
          const fieldId = f.id;
          const fieldName = f.name;
          const fieldLabel = (f.field_description || '').replace(/"/g, '""').replace(/,/g, ';');
          const fieldType = f.ttype;

          const modelId = Array.isArray(f.model_id) ? f.model_id[0] : (f.model_id || '');
          const modelName = f.model;

          const relatedModel = f.relation || '';
          let relatedModelId = '';
          if (relatedModel && modelLookup[relatedModel]) {
            relatedModelId = modelLookup[relatedModel].id;
          }

          const relationField = f.relation_field || '';
          const relationTable = f.relation_table || '';
          const column1 = f.column1 || '';
          const column2 = f.column2 || '';

          // Determine where primary data is stored
          let primaryDataLocation = '';
          if (fieldType === 'many2one') {
            // many2one: stores ID in this field, references 'id' column in related model
            primaryDataLocation = relatedModel ? `${relatedModel}.id` : '';
          } else if (fieldType === 'one2many') {
            // one2many: virtual field, data stored in related model's relation_field
            primaryDataLocation = relatedModel && relationField ? `${relatedModel}.${relationField}` : '';
          } else if (fieldType === 'many2many') {
            // many2many: uses junction table
            primaryDataLocation = relationTable ? `Junction: ${relationTable}` : '';
          } else if (f.store) {
            // Regular stored field: data in this model
            primaryDataLocation = `${modelName}.${fieldName}`;
          } else {
            primaryDataLocation = 'Computed';
          }

          const stored = f.store ? 'Yes' : 'No';

          csv += fieldId + ',' +
                 fieldName + ',' +
                 '"' + fieldLabel + '",' +
                 fieldType + ',' +
                 modelId + ',' +
                 modelName + ',' +
                 relatedModel + ',' +
                 relatedModelId + ',' +
                 relationField + ',' +
                 relationTable + ',' +
                 column1 + ',' +
                 column2 + ',' +
                 '"' + primaryDataLocation + '",' +
                 stored + '\n';
        });

        fs.writeFileSync('ir_model_fields_with_root_columns.csv', csv);

        console.log('\n=== SAVED: ir_model_fields_with_root_columns.csv ===\n');
        console.log('Total fields:', fields.length);
        console.log('\nColumns:');
        console.log('  1. Field_ID - ID in ir.model.fields');
        console.log('  2. Field_Name - Technical field name');
        console.log('  3. Field_Label - Human-readable label');
        console.log('  4. Field_Type - Field type');
        console.log('  5. Model_ID - Parent model ID');
        console.log('  6. Model_Name - Parent model name');
        console.log('  7. Related_Model - Referenced model (for relational fields)');
        console.log('  8. Related_Model_ID - Referenced model ID');
        console.log('  9. Relation_Field - Column in related model (for one2many)');
        console.log('  10. Relation_Table - Junction table (for many2many)');
        console.log('  11. Column1 - First FK column in junction table');
        console.log('  12. Column2 - Second FK column in junction table');
        console.log('  13. Primary_Data_Location - WHERE THE DATA IS ACTUALLY STORED');
        console.log('  14. Stored - Is field stored in database?');

        // Show examples for each relationship type
        console.log('\n=== RELATIONSHIP EXAMPLES ===\n');

        // many2one example
        const m2oExample = fields.find(f => f.ttype === 'many2one' && f.relation && f.model === 'crm.lead' && f.name === 'user_id');
        if (m2oExample) {
          console.log('MANY2ONE Example: crm.lead.user_id');
          console.log('  Field stores: INTEGER (foreign key)');
          console.log('  References: res.users.id');
          console.log('  Data Location: res.users table, "id" column');
          console.log('');
        }

        // one2many example
        const o2mExample = fields.find(f => f.ttype === 'one2many' && f.relation_field && f.model === 'crm.lead');
        if (o2mExample) {
          console.log('ONE2MANY Example: ' + o2mExample.model + '.' + o2mExample.name);
          console.log('  Field is: VIRTUAL (no column in database)');
          console.log('  Related Model: ' + o2mExample.relation);
          console.log('  Relation Field: ' + o2mExample.relation_field);
          console.log('  Data Location: ' + o2mExample.relation + '.' + o2mExample.relation_field);
          console.log('');
        }

        // many2many example
        const m2mExample = fields.find(f => f.ttype === 'many2many' && f.relation_table && f.model === 'crm.lead');
        if (m2mExample) {
          console.log('MANY2MANY Example: ' + m2mExample.model + '.' + m2mExample.name);
          console.log('  Junction Table: ' + m2mExample.relation_table);
          console.log('  Column1: ' + m2mExample.column1);
          console.log('  Column2: ' + m2mExample.column2);
          console.log('');
        }

        // Summary
        console.log('\n=== PRIMARY DATA LOCATION PATTERNS ===\n');
        console.log('Field Type      | Where Data Lives');
        console.log('----------------|--------------------------------------------------');
        console.log('many2one        | Related model\'s "id" column (e.g., res.users.id)');
        console.log('one2many        | Related model\'s foreign key field (e.g., mail.activity.res_id)');
        console.log('many2many       | Junction table with two FK columns');
        console.log('char/int/etc    | This model\'s column directly');
        console.log('Computed        | Calculated on-the-fly, not stored');
      }

      fetchBatch(0);
    });
  });
});
