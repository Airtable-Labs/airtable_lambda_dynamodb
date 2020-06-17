const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const processResponse = require('./process_response');
const TABLE_NAME = process.env.TABLE_NAME;
const IS_CORS = process.env.IS_CORS;
const PRIMARY_KEY = process.env.PRIMARY_KEY;

function buildErrorMessage(message, error) {
  error = error === undefined ? {} : error;
  return {
    errorMessage: message,
    error: error.message
  }
}

async function executeDynamo(dynamoDb, method, params) {
  try {
    let r = await dynamoDb[method](params).promise();
    return {
      body: r
    };
  } catch (dbError) {
    let errorResponse = buildErrorMessage(`Error: Execution update, caused a Dynamodb error, please look at your logs.`, dbError);
    if (dbError.code === 'ValidationException') {
      if (dbError.message.includes('reserved keyword')) {
        errorResponse.errorMessage = `Error: You're using AWS reserved keywords as attributes`;
      }
      console.log("Dynamo error: ", dbError);
    }
    return {
      body: errorResponse,
      statusCode: 500
    };
  }
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') {
    console.log("Responding to OPTIONS request");
    return processResponse(true);
  }
  console.log(event);



  // check the incoming request.  
  // Most methods will require an ID to take action on a resource in Dynamo
  // POST does not since you are creating a new record
  // this section will check the httpMethod of the request 
  const tableName = event.pathParameters !== null ? event.pathParameters.table_name : undefined;
  const requestedItemId = event.pathParameters !== null ? event.pathParameters.id : undefined;

  var params = {
    TableName: tableName
  };

  if (tableName === undefined) {
    let errorResponse = buildErrorMessage(`Error: You're missing the table parameter`);
    return processResponse(IS_CORS, errorResponse, 400);

  }

  if (!requestedItemId && event.httpMethod !== 'POST') {
    let errorResponse = buildErrorMessage(`Error: You're missing the id parameter`);
    return processResponse(IS_CORS, errorResponse, 400);
  } else if (requestedItemId) {
    const key = {};
    key[PRIMARY_KEY] = requestedItemId;
    params.Key = key;
  }

  // check if the incoming method will contain a request body
  if (event.httpMethod === 'POST') {
    params.Item = JSON.parse(event.body);
  } else if (event.httpMethod === 'PATCH') {
    const body = JSON.parse(event.body);
    params = {
      ...params,
      ...body
    };
  }


  // depending on the httpMethod, execute the corresponding dynamodb action
  let resp = {};
  if (event.httpMethod === 'DELETE') {
    console.log("Deleting record: ", requestedItemId);
    resp = await executeDynamo(dynamoDb, "delete", params);
  } else if (event.httpMethod === 'POST') {
    console.log("Creating new record");
    resp = await executeDynamo(dynamoDb, 'put', params);
  } else if (event.httpMethod === 'PATCH') {
    console.log("Updating record: ", requestedItemId);
    resp = await executeDynamo(dynamoDb, 'update', params);
  } else {
    resp = buildErrorMessage(`Method ${event.httpMethod} not supported`, 405);
  }

  // send the response
  return processResponse(IS_CORS, resp.body, resp.statusCode);

};