/*
   Copyright 2011 Jive Software

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

// Symbolic constant for our connection alias
var QUOTES = "quotes";

// Context parameters also used to manage quotes pagination
var params = {
    direction : "ascending",
    index : 0,
    limit : 3, // Will be replaced from user preferences
    offset : 0,
    order :  "dueDate"
}

// Configured connection we are using
var connection;

// Customers on this page, keyed by customerID
var customers = { };

// Factory for mini messages
var mini;

// Quotes for this page, as an array
var quotes = [ ];

// Users (sales reps) on this page, keyed by username
var users = { };

// The viewing user
var viewer;

// Enable all of the active page elements
function enableHandlers() {
    $(".approve").live("click", function() {
        var index = parseInt($(this).attr("data-index"));
        var quote = quotes[index];
        console.log("Approving quote " + JSON.stringify(quote));
        update(quote, "approved");
        var verb = "Approved";
        var user = users[quote.quoteUser.username];
        var url = $("#hidden-approval").attr("src");
        // Describe an activity stream entry that will be grouped under the specified title
        var entry = {
            activity : {
                body : '{@actor} approved a quote for {@target}',
                jiveDisplay : 'grouped', // Request grouping
                object : {
                    mediaLink : {
                        url : url
                    },
                    summary : 'The approved quote totaled $<b>' + quote.totalPriceString
                            + '</b> for account <i>' + quote.customer.name + '</i>.  '
                },
                target : {
                    id : 'urn:jiveObject:user/' + user.id
                },
                title : "Approved Quotes", // Grouped entries SHOULD have a title but will get a blank one if not present
                verb : verb
            }
        };
        console.log("Creating activity stream entry = " + JSON.stringify(entry));
        osapi.activities.create(entry).execute(function(response) {
            console.log("Creating activity stream entry response = " + JSON.stringify(response));
//            alert("Created an activity stream entry");
        });
        return false;
    });
    $("#next").click(function() {
        console.log("Next clicked at offset " + params.offset);
        params.offset += params.limit;
        $(this).blur();
        loadQuotes();
        return false;
    })
    $("#previous").click(function() {
        console.log("Previous clicked at offset " + params.offset);
        params.offset -= params.limit;
        if (params.offset < 0) {
            params.offset = 0;
        }
        $(this).blur();
        loadQuotes();
        return false;
    });
    $("#refresh").click(function() {
        console.log("Refresh clicked at offset " + params.offset);
        $(this).blur();
        loadQuotes();
        return false;
    });
    $(".reject").live("click", function() {
        var index = parseInt($(this).attr("data-index"));
        var quote = quotes[index];
        console.log("Rejecting quote " + JSON.stringify(quote));
        update(quote, "rejected");
        var verb = "Rejected";
        var user = users[quote.quoteUser.username];
        var url = $("#hidden-reject").attr("src");
        // Describe an activity stream entry that will NOT be grouped
        var entry = {
            activity : {
                body : '{@actor} rejected a quote for {@target}',
                jiveDisplay : 'update', // Optional, because this is the default
                object : {
                    mediaLink : {
                        url : url
                    },
                    summary : 'The rejected quote totaled $<b>' + quote.totalPriceString
                            + '</b> for account <i>' + quote.customer.name + '</i>.  '
                },
                target : {
                    id : 'urn:jiveObject:user/' + user.id
                },
                verb : verb
            }
        };
        console.log("Creating activity stream entry = " + JSON.stringify(entry));
        osapi.activities.create(entry).execute(function(response) {
            console.log("Creating activity stream entry response = " + JSON.stringify(response));
//            alert("Created an activity stream entry");
        });
        return false;
    });
    $(".review").live("click", function() {
        var index = parseInt($(this).attr("data-index"));
        var quote = quotes[index];
        console.log("Reviewing quote " + JSON.stringify(quote));
        var verb = "post";
        var user = users[quote.quoteUser.username];
        var url = $("#hidden-refresh").attr("src");
        // Create an action alert for the specified sales rep
        var entry = {
            activity : {
                body : '{@target} needs to review a quote with {@actor}',
                object : {
                    actionLinks : [
                        { title : 'Dismiss' }
                    ],
                    mediaLink : {
                        url : url
                    },
                    summary : 'The quote to review totals $<b>' + quote.totalPriceString
                            + '</b> for account <i>' + quote.customer.name + '</i>.  '
                },
                target : {
                    id : 'urn:jiveObject:user/' + user.id
                },
                title : 'Schedule Quote Review'
            },
            deliverTo : [ viewer.id, user.id ] // Can be an array of ids to send a task to multiple users
        };
        console.log("Creating action = " + JSON.stringify(entry));
        osapi.activities.create(entry).execute(function(response) {
            console.log("Creating action response = " + JSON.stringify(response));
            mini.createTimerMessage("Created an action alert for " + user.name, 5);
        });
        return false;
    });
}

// Generate an "approve" action for the specified row
function generateApprove(index) {
    var html = "<a href=\"#\"";
    html += " class=\"icon i-approve approve\"";
    html += " data-index=\"" + index + "\">";
    html += "Approve";
    html += "</a>";
    return html;
}

// Generate a "reject" action for the specified row
function generateReject(index) {
    var html = "<a href=\"#\"";
    html += " class=\"icon i-reject reject\"";
    html += " data-index=\"" + index + "\">";
    html += "Reject";
    html += "</a>";
    return html;
}

// Generate a "review" action for the specified row
function generateReview(index) {
    var html = "<a href=\"#\"";
    html += " class=\"icon i-refresh review\"";
    html += " data-index=\"" + index + "\">";
    html += "Review";
    html += "</a>";
    return html;
}

// On-view-load initialization
function init() {
/*
    var url = "http://craig-z800.jiveland.com/jiveapps/examples/jive-connects/quotes-connects/templates.xml";
    var params = {};
    params[gadgets.io.RequestParameters.CONTENT_TYPE] =
        gadgets.io.ContentType.TEXT;
    gadgets.io.makeRequest(url, function(obj) {
        console.log("Load template data " + JSON.stringify(obj.data));
        debugger;
        opensocial.template.Loader.loadContent(obj.data, url);
        for (var name in os.registeredTemplates_) {
            console.log("Registered template named " + name);
            var value = os.registeredTemplates_[name];
            for (subname in value) {
                console.log("   Subname is " + subname);
                var subvalue = value[subname];
                console.log("  Subvalue is " + subvalue);
            }
        }
        var template = opensocial.template.getTemplate("q:canvasBody");
        console.log("template is " + JSON.stringify(template));
    }, params);
*/
    mini = new gadgets.MiniMessage();
    var data = gadgets.views.getParams();
    console.log("Received params " + JSON.stringify(data));
    if (data && data.offset) {
        params = data;
    }
    prefs = new gadgets.Prefs();
    console.log("Limit preference is " + prefs.getString("limit"));
    params.limit = prefs.getInt("limit");
    console.log("Params are now " + JSON.stringify(params));
    enableHandlers();
    switchViewControls();
    gadgets.window.adjustHeight();
    loadViewer();
//    loadQuotes(); // Called from within switchViewControls at the appropriate time
}

// Load and cache information about the configured connection we are using
function loadConnection() {
    console.log("Loading connection information")
    osapi.jive.connects.connection({
        alias : QUOTES
    }).execute(function(result) {
        console.log("Connection information response is " + JSON.stringify(result));
        connection = result;
    });

}

function _contains(ids, id) {
    for (var i = 0; i < ids.length; i++) {
        if (ids[i] == id) {
            return true;
        }
    }
    return false;
}

// Return a request object to retrieve the specified customer by customerID
function loadCustomer(customerID) {
    return osapi.jive.connects.get({
        alias : QUOTES,
        headers : { 'Accept' : [ 'application/json' ] },
        href : '/customers/' + customerID
    });
}

// Retrieve all the unique customers for the quotes on this page, and cache them by customerID
function loadCustomers() {
    console.log("Loading customer information");
    var customerIDs = [ ];
    $.each(quotes, function(index, quote) {
        if (!_contains(customerIDs, quote.customer.id)) {
            customerIDs.push(quote.customer.id);
        }
    });
    if (customerIDs.length < 1) {
        return;
    }
    console.log("Requesting customer IDs " + JSON.stringify(customerIDs));
    var batch = osapi.newBatch();
    $.each(customerIDs, function(index, customerID) {
        batch.add('customer' + customerID, loadCustomer(customerID));
    });
    batch.execute(function(responses) {
        customers = { };
        $.each(customerIDs, function(index, customerID) {
            var response = responses['customer' + customerID];
            // TODO - deal with response.error not being null
            customers[customerID] = response.content;
        });
        console.log("Result customers = " + JSON.stringify(customers));
    });
}

// Retrieve all the quotes on this page, respecting our pagination controls
function loadQuotes() {
    var message = mini.createStaticMessage("Loading quotes for page " + ((params.offset / params.limit) + 1));
    $("#table-body").html("<tr><td colspan=\"5\" align=\"center\">&nbsp;</td></tr>");
    osapi.jive.connects.get({
        alias : QUOTES,
        headers : { 'Accept' : [ 'application/json' ] },
        href : '/quotes',
        params : params
    }).execute(function(response) {
        mini.dismissMessage(message);
        if (response.error) {
            if (response.error.code == 401) {
                console.log("Received a 401 response " + JSON.stringify(response) + ", triggering reconfiguration before trying again");
                osapi.jive.connects.reconfigure(QUOTES, response, function(feedback) {
                    console.log("Received reconfigure feedback " + JSON.stringify(feedback));
                    loadQuotes();
                })
            }
            else {
                mini.createDismissibleMessage("Error " + response.error.code + " loading data: " + response.error.message);
            }
        }
        else {
            console.log("loadQuotes response is " + JSON.stringify(response));
            var html = "";
            quotes = response.content;
            $.each(quotes, function(index, quote) {
                html = populateRow(index, quote, html);
            });
            $("#table-body").html(html);
            gadgets.window.adjustHeight();
            loadConnection();
            loadCustomers();
            loadUsers();
        }
    })
}

// Hack to calculate userID (TODO - obsolete after Jive Core returns it)
function hackUserID(user) {
    if (!user.id) {
        var url = user.resources.self.ref;
        var index = url.lastIndexOf("/");
        var id = url.substring(index + 1);
        user.id = id;
    }
}

// Return a request object to retrieve the specified user by username
function loadUser(username) {
    return osapi.jive.core.users.get({
        username : username
    });
}

// Use Jive Core API to retrieve user profile informationf or each unique sales rep
// in the quotes on this page, and cache them by username
function loadUsers() {
    console.log("Loading user information");
    var usernames = [ ];
    $.each(quotes, function(index, quote) {
        if (!_contains(usernames, quote.quoteUser.username)) {
            usernames.push(quote.quoteUser.username);
        }
    });
    if (usernames.length < 1) {
        return;
    }
    console.log("Requesting usernames " + JSON.stringify(usernames));
    users = { };
/* TODO use batch when core supports it
    var batch = osapi.newBatch();
    $.each(usernames, function(index, username) {
        batch.add(username, loadUser(username));
    });
    batch.execute(function(responses) {
        var response = responses[username];
        // TODO - deal with response.error not being null
        var user = response.data;
        hackUserID(user);
        users[user.username] = user;
    });
*/
    $.each(usernames, function(index, username) {
        loadUser(username).execute(function(response) {
            if (response.error) {
                mini.createDismissibleMessage("Error looking up user information for username '" + username + "', code=" +
                      response.error.code + ", message='" + response.error.message + "'");
            }
            else {
//                var user = response.content;
                var user = response.data; // TODO - should be response.content?
                console.log("Got user " + JSON.stringify(user));
                hackUserID(user);
                users[user.username] = user;
            }
        });
    });
}

// Load the viewer user
function loadViewer() {
    console.log("Loading viewing user");
    osapi.jive.core.users.get({
        id : "@viewer"
    }).execute(function(response) {
        if (response.error) {
            console.log("Error loading viewing user, code=" + response.error.code + ", message=" + response.error.message);
        }
        else {
            viewer = response.data;
            console.log("Got user " + JSON.stringify(viewer));
        }
    });
}

// Update the specified quote to reflect the specified new approve/reject status
function update(quote, newstatus) {
    delete quote.jiveUserID;
    quote.status = newstatus;
    osapi.jive.connects.put({
        alias : QUOTES,
        body : quote,
        headers : { 'Content-Type' : [ 'application/json' ] },
        href : '/quotes/' + quote.id
    }).execute(function(response) {
        console.log("Update response is " + JSON.stringify(response));
        loadQuotes();
    });
}

// Register our on-view-load handler
gadgets.util.registerOnLoadHandler(init);
