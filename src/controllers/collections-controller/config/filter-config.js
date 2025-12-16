import { STAGE } from '../../../utils/query-builder/query-builder.js'; 

export const filter_config = [
    {
        filter: 'orgId', 
        field: 'orgId', 
        type: 'string', 
        stage: STAGE.PRE_LOOKUP 
    },
    {
        filter: 'status', 
        field: 'status', 
        type: 'string',
        stage: STAGE.PRE_LOOKUP,
    },
    {
        filter: 'search', 
        target: ['name', 'email'], // Search across multiple fields
        regex: true, 
        stage: STAGE.PRE_LOOKUP, // Can use PRE_LOOKUP if not using $or for better indexing
    },
    {
        filter: 'page',
        stage: STAGE.PAGINATION, // Handled by handlePagination
        transformer: Number
    },
    {
        filter: 'limit',
        stage: STAGE.PAGINATION, // Handled by handlePagination
        transformer: Number
    },
    {
        filter: 'sortBy',
        stage: STAGE.SORT, // Handled by handleSort
    },
];