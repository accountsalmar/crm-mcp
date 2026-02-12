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
  console.log('');

  const objectClient = xmlrpc.createSecureClient({
    host: 'duracubeuat.com.au',
    port: 443,
    path: '/xmlrpc/2/object',
    headers: { 'Content-Type': 'text/xml' }
  });

  // First, get all models to build a lookup table for related model IDs
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

    // Create lookup: model_name -> model_id
    const modelLookup = {};
    models.forEach(m => {
      modelLookup[m.model] = { id: m.id, name: m.name };
    });

    // Now fetch all fields
    console.log('');
    console.log('Step 2: Fetching all fields in batches...');

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
            fields: ['id', 'name', 'field_description', 'model_id', 'model', 'ttype', 'relation', 'relation_field', 'store', 'required', 'readonly'],
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
        console.log('');
        console.log('Step 3: Processing and saving...');

        // Create CSV with all requested columns
        let csv = 'Field_ID,Field_Name,Field_Label,Field_Type,Model_ID,Model_Name,Related_Model,Related_Model_ID,Related_Model_Display_Name,Stored,Required,Readonly\n';

        fields.forEach(f => {
          const fieldId = f.id;
          const fieldName = f.name;
          const fieldLabel = (f.field_description || '').replace(/"/g, '""').replace(/,/g, ';');
          const fieldType = f.ttype;

          // Model info
          const modelId = Array.isArray(f.model_id) ? f.model_id[0] : (f.model_id || '');
          const modelName = f.model;

          // Related model info (for relational fields)
          const relatedModel = f.relation || '';
          let relatedModelId = '';
          let relatedModelDisplayName = '';

          if (relatedModel && modelLookup[relatedModel]) {
            relatedModelId = modelLookup[relatedModel].id;
            relatedModelDisplayName = modelLookup[relatedModel].name;
          }

          const stored = f.store ? 'Yes' : 'No';
          const required = f.required ? 'Yes' : 'No';
          const readonly = f.readonly ? 'Yes' : 'No';

          csv += fieldId + ',' +
                 fieldName + ',' +
                 '"' + fieldLabel + '",' +
                 fieldType + ',' +
                 modelId + ',' +
                 modelName + ',' +
                 relatedModel + ',' +
                 relatedModelId + ',' +
                 '"' + relatedModelDisplayName + '",' +
                 stored + ',' +
                 required + ',' +
                 readonly + '\n';
        });

        fs.writeFileSync('ir_model_fields_with_relations.csv', csv);

        console.log('');
        console.log('=== SAVED: ir_model_fields_with_relations.csv ===');
        console.log('');
        console.log('Total fields:', fields.length);
        console.log('');
        console.log('Columns:');
        console.log('  1. Field_ID - ID of the field in ir.model.fields');
        console.log('  2. Field_Name - Technical field name');
        console.log('  3. Field_Label - Human-readable label');
        console.log('  4. Field_Type - Field type (char, many2one, etc.)');
        console.log('  5. Model_ID - ID of the parent model in ir.model');
        console.log('  6. Model_Name - Technical name of parent model');
        console.log('  7. Related_Model - For relational fields, the related model name');
        console.log('  8. Related_Model_ID - ID of the related model in ir.model');
        console.log('  9. Related_Model_Display_Name - Display name of related model');
        console.log('  10. Stored - Is field stored in database?');
        console.log('  11. Required - Is field required?');
        console.log('  12. Readonly - Is field readonly?');

        // Summary of relational fields
        const relationalFields = fields.filter(f => f.relation);
        console.log('');
        console.log('=== RELATIONAL FIELDS SUMMARY ===');
        console.log('Total relational fields:', relationalFields.length);

        // Count by type
        const byType = {};
        relationalFields.forEach(f => {
          if (!byType[f.ttype]) byType[f.ttype] = 0;
          byType[f.ttype]++;
        });

        console.log('');
        console.log('By Type:');
        Object.entries(byType).sort((a,b) => b[1] - a[1]).forEach(([t, c]) => {
          console.log('  ' + t + ': ' + c);
        });

        // Top related models
        const byRelation = {};
        relationalFields.forEach(f => {
          if (!byRelation[f.relation]) byRelation[f.relation] = 0;
          byRelation[f.relation]++;
        });

        console.log('');
        console.log('Top 15 Most Referenced Models:');
        Object.entries(byRelation)
          .sort((a,b) => b[1] - a[1])
          .slice(0, 15)
          .forEach(([model, count]) => {
            console.log('  ' + model + ': ' + count + ' references');
          });
      }

      // Start fetching
      fetchBatch(0);
    });
  });
});
