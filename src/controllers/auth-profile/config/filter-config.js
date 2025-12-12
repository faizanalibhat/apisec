import { STAGE } from '../../../utils/query-builder/query-builder.js'; 

const filter_config = [
    // ----------------------------------------------------------------------
    // 1. Mandatory Filter (orgId)
    // ----------------------------------------------------------------------
    {
        // This is a hidden, mandatory filter provided by the service logic, 
        // not by the client query string. We define it so it can be manually
        // added to the queryParams object before calling buildStages.
        filter: 'orgId', 
        field: 'orgId', // Target MongoDB field
        type: 'string', // Assuming orgId is a string or ObjectID
        stage: STAGE.PRE_LOOKUP 
    },

    // ----------------------------------------------------------------------
    // 2. Common Filter (Example: Status)
    // ----------------------------------------------------------------------
    {
        // Query: ?status=ACTIVE
        filter: 'status', 
        field: 'status', 
        type: 'string',
        stage: STAGE.PRE_LOOKUP,
        // The default handler (handleDefaultMatch) will apply status: 'ACTIVE'
    },

    // ----------------------------------------------------------------------
    // 3. Search Filter (Example: Search by Name)
    // ----------------------------------------------------------------------
    {
        // Query: ?search=john
        filter: 'search', 
        target: ['name', 'email'], // Search across multiple fields
        regex: true, 
        stage: STAGE.PRE_LOOKUP, // Can use PRE_LOOKUP if not using $or for better indexing
        // If you were using a text index, you would map this to the SEARCH stage
    },

    // ----------------------------------------------------------------------
    // 4. Pagination and Sorting
    // ----------------------------------------------------------------------
    {
        // Query: ?page=2
        filter: 'page',
        stage: STAGE.PAGINATION, // Handled by handlePagination
        transformer: Number
    },
    {
        // Query: ?limit=20
        filter: 'limit',
        stage: STAGE.PAGINATION, // Handled by handlePagination
        transformer: Number
    },
    {
        // Query: ?sortBy=-createdAt
        filter: 'sortBy',
        stage: STAGE.SORT, // Handled by handleSort
    },
];