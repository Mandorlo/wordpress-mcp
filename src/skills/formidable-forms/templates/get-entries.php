<?php
/**
 * Get entries/submissions for a Formidable Form
 * 
 * Variables (injected by template):
 *   $form_id - The form ID to get entries for
 *   $limit   - Number of entries per page
 *   $page    - Current page number
 * 
 * Returns: JSON object with entries array and pagination info
 */

if (!class_exists('FrmEntry') || !class_exists('FrmEntryMeta')) {
    echo json_encode(['error' => 'Formidable Forms plugin is not active']);
    exit;
}

$offset = ($page - 1) * $limit;

// Get total count
$total = FrmEntry::getRecordCount(array('form_id' => $form_id));

// Get entries with pagination
$entries = FrmEntry::getAll(
    array('it.form_id' => $form_id),
    ' ORDER BY it.created_at DESC LIMIT ' . $offset . ', ' . $limit
);

$entry_data = array();
foreach ($entries as $entry) {
    // Get all meta values for this entry
    $metas = FrmEntryMeta::getAll(
        array('item_id' => $entry->id),
        ' ORDER BY fi.field_order'
    );
    
    $meta_values = array();
    foreach ($metas as $meta) {
        $field_id = $meta->field_id;
        $value = maybe_unserialize($meta->meta_value);
        
        // Get field name for better readability
        $field = FrmField::getOne($field_id);
        if ($field) {
            $meta_values[$field->name] = $value;
        } else {
            $meta_values['field_' . $field_id] = $value;
        }
    }
    
    $entry_data[] = array(
        'id' => $entry->id,
        'item_key' => $entry->item_key,
        'form_id' => $entry->form_id,
        'user_id' => $entry->user_id,
        'created_at' => $entry->created_at,
        'updated_at' => $entry->updated_at,
        'ip' => $entry->ip,
        'meta' => $meta_values
    );
}

$result = array(
    'entries' => $entry_data,
    'total' => (int) $total,
    'page' => $page,
    'limit' => $limit,
    'total_pages' => ceil($total / $limit)
);

echo json_encode($result);
