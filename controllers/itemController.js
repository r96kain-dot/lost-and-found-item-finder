//reusing database connection from Richard's code. Thanks Richard!
//ensure receipt and collection of items are recorded in the database
const pool = require("../db/connection");
const { receiveItem, collectItem } = require("../services/itemService");

//DO NOT REPEAT YOURSELF This function is a generic handler for item operations (receive and collect)
function handler(operation, buildInput){
    return async(req, res) => {
//i am so mad
        try {
const result = await operation(pool, {
    ...buildInput(req),

    moderatorId: req.session.moderatorId
});
//EXPLORED ASYNC/AWAIT AND PROMISES. ASYNC/AWAIT IS MORE READABLE. PROMISES ARE MORE FLEXIBLE. I CHOSE ASYNC/AWAIT FOR THIS PROJECT.

    return res
        .status(result.verified === false ? 400 : 200)
        .json(result);
        
        //200 good 400 bad

}
        catch (error) {
            //Log unexpected errors without making database vulnerable. I do not want to expose the database to the public. I want to keep it secure.
    if (!error.status) {
        console.error("Item failed:", error.code || error.name);
    }
//500 = unexpected error. 400 = expected error. 200 = success. 404 = not found. 401 = unauthorized. 403 = forbidden.
    return res.status(error.status || 500).json({
        error: error.status
            ? error.message
            : "Unable to save item."
    });
}               //close catch
    };              //close async function
}                   //close handler function


// Make these handlers available to moderatorRoutes.js.
module.exports = {
    // Get the found report ID from the URL.
    receive: handler(receiveItem, req => ({
        matchId: Number(req.params.matchId),
    })),

    //match ID and claimiant's sub details
    collect: handler(collectItem, req => ({
        matchId: Number(req.params.matchId),
        referenceCode: req.body?.reference_code,
        contactDetail: req.body?.contact_detail
    }))
};