/**
 * AgriBridge - Coordination Engine
 * Story-Driven MVP for Live Demonstration
 */

// --- SUPABASE CONFIGURATION ---
// IMPORTANT: Paste your Supabase Project URL and Publishable (Anon) Key here.
// DO NOT use the Secret Key in this frontend file.
const SUPABASE_URL = 'https://udhpniquishfulndiubl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkaHBuaXF1aXNoZnVsbmRpdWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMjIyMDgsImV4cCI6MjA5OTg5ODIwOH0.gF8Y4RGw62EoqOXntPjddWzoXiErBYZDj_FC4efmkew';

// --- n8n CONFIGURATION ---
const N8N_WEBHOOK_URL = 'https://prabhav-prashant.app.n8n.cloud/webhook/new-farmer-request';
// Initialize Supabase Client
let supabaseClient = null;
try {
    if (window.supabase && SUPABASE_URL.startsWith('http') && SUPABASE_URL !== 'https://YOUR_PROJECT_ID.supabase.co') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.warn("Supabase not initialized: Please update SUPABASE_URL and SUPABASE_ANON_KEY.");
    }
} catch (e) {
    console.error("Supabase initialization error:", e);
}

// --- GLOBAL STATE ---
const appState = {
    currentUserRole: null, 
    currentView: 'landing', 
    
    // Mock Market Data
    marketPrices: [
        { crop: 'Tomato', price: '₹14', unit: 'kg', trend: 'down' },
        { crop: 'Potato', price: '₹19', unit: 'kg', trend: 'up' },
        { crop: 'Cauliflower', price: '₹18', unit: 'kg', trend: 'stable' },
        { crop: 'Leafy', price: '₹12', unit: 'bunch', trend: 'down' }
    ],

    // Workflow State (Shared)
    requests: [],
    notifications: [],
    unreadCount: 0,

    // Methods
    navigate: function(view, role = null) {
        if (role) this.currentUserRole = role;
        if (view === 'landing') this.currentUserRole = null;
        this.currentView = view;
        render();
    },

    notify: function(message, targetRole) {
        this.notifications.push({ message, role: targetRole, id: Date.now() });
        if (this.currentUserRole === targetRole || targetRole === 'all') {
            this.unreadCount++;
            showToast(`🔔 ${message}`, 'info');
            renderHeader(); // Just update header for badge
        }
    },

    loadRequests: async function() {
        if (!supabaseClient) return;
        
        // Debounce to prevent duplicate realtime renders
        if (this._fetchTimeout) clearTimeout(this._fetchTimeout);
        this._fetchTimeout = setTimeout(async () => {
            const { data, error } = await supabaseClient.from('requests').select('*').order('id', { ascending: false });
            if (!error && data) {
                // Deduplicate strictly by ID in case of DB anomalies
                const unique = [];
                const seen = new Set();
                for (let r of data) {
                    if (!seen.has(r.id)) {
                        seen.add(r.id);
                        unique.push(r);
                    }
                }
                this.requests = unique;
                render();
            } else if (error) {
                console.error("Error loading requests:", error);
            }
        }, 150);
    },


    addRequest: async function(req) {
        req.status = 'submitted';
        req.dealer_status = 'pending';
        req.transport_status = 'none';
        req.storage_status = 'none';
        
        this.requests.unshift(req);
        this.notify('New harvest available nearby.', 'dealer');
        render();

        if (supabaseClient) {
            const { error } = await supabaseClient.from('requests').insert([req]);
            if (error) {
                console.error("Error saving request:", error);
            } else if (N8N_WEBHOOK_URL && N8N_WEBHOOK_URL !== 'YOUR_WEBHOOK_URL_HERE') {
                // Standard REST API call
                fetch(N8N_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(req)
                })
                .then(res => {
                    if (res.ok) console.log("n8n webhook triggered successfully");
                    else console.error("n8n webhook failed with status:", res.status);
                })
                .catch(err => console.error("n8n webhook error:", err));
            }
        }
    },

    dealerMakeOffer: async function(id) {
        const input = document.getElementById('offer-' + id);
        if (!input || !input.value) return;
        const price = input.value;
        const req = this.requests.find(r => r.id === id);
        if (req) {
            req.dealer_status = 'offered_' + price;
            this.notify('You received a new dealer offer.', 'farmer');
            render();
            if (supabaseClient) await supabaseClient.from('requests').update({ dealer_status: req.dealer_status }).eq('id', id);
        }
    },

    farmerAcceptOffer: async function(id) {
        const req = this.requests.find(r => r.id === id);
        if (req) {
            req.status = 'dealer_accepted';
            req.dealer_status = 'accepted';
            this.notify('Farmer accepted your offer.', 'dealer');
            render();
            if (supabaseClient) await supabaseClient.from('requests').update({ status: req.status, dealer_status: req.dealer_status }).eq('id', id);
        }
    },
    
    farmerRejectOffer: function(id) {
        // Just hide it locally for the demo
        const req = this.requests.find(r => r.id === id);
        if (req) {
            req.dealer_status = 'pending'; // Reverts it
            render();
            if (supabaseClient) supabaseClient.from('requests').update({ dealer_status: req.dealer_status }).eq('id', id);
        }
    },

    dealerRejectOffer: function(id) {
        let rejected = JSON.parse(localStorage.getItem('dealerRejected') || '[]');
        if (!rejected.includes(id)) {
            rejected.push(id);
            localStorage.setItem('dealerRejected', JSON.stringify(rejected));
        }
        render();
    },

    dealerBookLogistics: async function(id) {
        const req = this.requests.find(r => r.id === id);
        if (req) {
            req.transport_status = 'requested';
            this.notify('New transport request from Dealer.', 'logistics');
            render();
            if (supabaseClient) await supabaseClient.from('requests').update({ transport_status: req.transport_status }).eq('id', id);
        }
    },
    
    dealerReserveStorage: async function(id) {
        const req = this.requests.find(r => r.id === id);
        if (req) {
            req.storage_status = 'requested';
            this.notify('New storage reservation request.', 'storage');
            render();
            if (supabaseClient) await supabaseClient.from('requests').update({ storage_status: req.storage_status }).eq('id', id);
        }
    },

    logisticsConfirm: async function(id) {
        const req = this.requests.find(r => r.id === id);
        if (req) {
            req.transport_status = 'confirmed';
            this.notify('Transport confirmed.', 'dealer');
            render();
            if (supabaseClient) await supabaseClient.from('requests').update({ transport_status: req.transport_status }).eq('id', id);
        }
    },
    
    logisticsComplete: async function(id) {
        const req = this.requests.find(r => r.id === id);
        if (req) {
            req.status = 'completed';
            req.transport_status = 'completed';
            this.notify('Delivery completed successfully.', 'dealer');
            this.notify('Your harvest reached the destination.', 'farmer');
            render();
            if (supabaseClient) await supabaseClient.from('requests').update({ status: req.status, transport_status: req.transport_status }).eq('id', id);
        }
    },

    storageAccept: async function(id) {
        const req = this.requests.find(r => r.id === id);
        if (req) {
            req.storage_status = 'approved';
            this.notify('Storage reservation approved.', 'dealer');
            render();
            if (supabaseClient) await supabaseClient.from('requests').update({ storage_status: req.storage_status }).eq('id', id);
        }
    },
    
    storageReject: async function(id) {
        const req = this.requests.find(r => r.id === id);
        if (req) {
            req.storage_status = 'rejected';
            this.notify('Storage reservation rejected.', 'dealer');
            render();
            if (supabaseClient) await supabaseClient.from('requests').update({ storage_status: req.storage_status }).eq('id', id);
        }
    },

    logisticsReject: async function(id) {
        const reason = prompt("Enter rejection reason (e.g. Truck unavailable, Route not serviceable):");
        if (!reason) return;
        const req = this.requests.find(r => r.id === id);
        if (req) {
            req.transport_status = 'rejected';
            this.notify(`Logistics rejected: ${reason}`, 'dealer');
            render();
            if (supabaseClient) await supabaseClient.from('requests').update({ transport_status: req.transport_status }).eq('id', id);
        }
    },

    resetDemo: async function() {
        if (!confirm("Are you sure you want to reset the demo? This will delete all requests.")) return;
        
        // Clear local storage
        localStorage.clear();
        
        // Delete all records from Supabase (by matching a universally true condition)
        if (supabaseClient) {
            await supabaseClient.from('requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }
        
        this.requests = [];
        this.notify('Demo has been reset.', 'all');
        render();
    }
};

// --- SUPABASE REALTIME SUBSCRIPTION ---
if (supabaseClient) {
    supabaseClient.channel('public:requests')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, (payload) => {
            // Automatically reload data across all clients when a database change occurs
            appState.loadRequests();
        })
        .subscribe();
}

// --- RULES ENGINE (Research Driven) ---
function getRecommendation(crop) {
    crop = crop.toLowerCase();
    if (crop.includes('potato') || crop.includes('onion')) {
        return {
            status: 'Recommended',
            icon: '🟢',
            title: 'Storage Suitable',
            reasons: ['Long shelf life', 'Storage available', 'Common practice'],
            insights: 'Interviews show farmers typically wait for better prices since these crops can survive 3-6 months in local cold storage.',
            needs_storage: true,
            suggestedSteps: ['Request Dealer Offer', 'Reserve Storage', 'Book Transport'],
            workflowVisual: 'Farmer ➔ Storage ➔ Dealer ➔ Transport'
        };
    } else {
        return {
            status: 'Immediate',
            icon: '🟠',
            title: 'Immediate Sale Recommended',
            reasons: ['Highly Perishable', 'Small Quantity', 'Storage usually uneconomical'],
            insights: 'Field research indicates 40% loss if highly perishable crops aren\'t sold within 24 hours. Local immediate sales are preferred over centralized storage.',
            needs_storage: false,
            suggestedSteps: ['Request Dealer', 'Book Pickup'],
            workflowVisual: 'Dealer ➔ Pickup ➔ Market'
        };
    }
}

// --- UI COMPONENTS ---

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast-enter flex items-center p-3 mb-2 bg-white text-gray-800 rounded-lg shadow-lg border-l-4 border-blue-500 max-w-sm pointer-events-auto`;
    toast.innerHTML = `<span class="font-medium text-sm">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.replace('toast-enter', 'toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}


function renderWorkflowTracker(req) {
    const steps = [
        { key: 'submitted', label: 'Submitted', done: true },
        { key: 'offered', label: 'Offers Received', done: req.dealer_status.startsWith('offered_') || req.dealer_status === 'accepted' },
        { key: 'accepted', label: 'Dealer Coordinating', done: req.dealer_status === 'accepted' },
        { key: 'scheduled', label: 'Pickup Confirmed', done: req.transport_status === 'confirmed' || req.transport_status === 'completed' },
        { key: 'completed', label: 'Completed', done: req.status === 'completed' }
    ];

    return `
        <div class="mt-4 pt-4 border-t border-gray-100">
            <h5 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Workflow Tracker</h5>
            <div class="flex items-center justify-between relative">
                <div class="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-0.5 bg-gray-200 z-0"></div>
                ${steps.map((step, idx) => `
                    <div class="relative z-10 flex flex-col items-center bg-white px-2">
                        <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step.done ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'}">
                            ${step.done ? '<i class="fa-solid fa-check"></i>' : (idx + 1)}
                        </div>
                        <span class="text-[10px] font-semibold mt-1 text-center leading-tight ${step.done ? 'text-gray-800' : 'text-gray-400'}">${step.label}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}


// --- VIEWS ---

function renderLanding() {
    return `
        <div class="animate-fade-in max-w-4xl mx-auto">
            <!-- Story Section -->
            <div class="text-center mb-12 mt-8">
                <span class="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">Why AgriBridge?</span>
                
                <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 text-left bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                    <div>
                        <h3 class="text-lg font-bold text-red-500 mb-2"><i class="fa-solid fa-triangle-exclamation mr-2"></i>The Problem</h3>
                        <p class="text-gray-600 text-sm leading-relaxed">Small farmers struggle to decide what to do after harvest because information and coordination are fragmented. Existing infrastructure is disconnected.</p>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-primary mb-2"><i class="fa-solid fa-lightbulb mr-2"></i>The Solution</h3>
                        <p class="text-gray-600 text-sm leading-relaxed">AgriBridge connects Farmers, Dealers, Logistics and Cold Storage on one platform, helping them coordinate post-harvest activities through a single workflow.</p>
                    </div>
                </div>

                <h1 class="text-3xl md:text-4xl font-extrabold text-gray-900 mt-10 mb-4 tracking-tight">AgriBridge</h1>
                <p class="text-xl text-gray-600 mb-8 max-w-2xl mx-auto font-medium">A post-harvest coordination platform connecting Farmers, Dealers, Logistics Providers and Cold Storage Operators to simplify post-harvest decisions.</p>
                
                <!-- Visual Flow diagram -->
                <div class="flex flex-wrap justify-center items-center gap-3 text-sm font-semibold text-gray-500 mb-12 bg-gray-50 p-4 rounded-xl border border-gray-200 inline-flex">
                    <span class="text-green-600"><i class="fa-solid fa-tractor mr-1"></i> Farmer</span>
                    <i class="fa-solid fa-arrow-right text-gray-300"></i>
                    <span>Harvest</span>
                    <i class="fa-solid fa-arrow-right text-gray-300"></i>
                    <span class="text-primary font-bold">AgriBridge</span>
                    <i class="fa-solid fa-arrow-right text-gray-300"></i>
                    <span class="text-blue-600"><i class="fa-solid fa-store mr-1"></i> Dealer</span>
                    <i class="fa-solid fa-arrow-right text-gray-300"></i>
                    <span class="text-orange-500"><i class="fa-solid fa-truck mr-1"></i> Transport</span>
                    <i class="fa-solid fa-arrow-right text-gray-300"></i>
                    <span class="text-cyan-600"><i class="fa-solid fa-snowflake mr-1"></i> Storage (Optional)</span>
                    <i class="fa-solid fa-arrow-right text-gray-300"></i>
                    <span class="text-gray-800"><i class="fa-solid fa-shop mr-1"></i> Market</span>
                </div>
            </div>
            
            <div class="text-center mb-6"><h3 class="text-lg font-bold text-gray-400">Enter as</h3></div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col items-center text-center cursor-pointer card-lift hover:border-green-300" onclick="appState.navigate('farmerDashboard', 'farmer')">
                    <span class="text-4xl mb-3">👨‍🌾</span><h3 class="font-bold text-gray-800">Farmer</h3>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col items-center text-center cursor-pointer card-lift hover:border-blue-300" onclick="appState.navigate('dealerDashboard', 'dealer')">
                    <span class="text-4xl mb-3">🏪</span><h3 class="font-bold text-gray-800">Dealer</h3>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col items-center text-center cursor-pointer card-lift hover:border-cyan-300" onclick="appState.navigate('storageDashboard', 'storage')">
                    <span class="text-4xl mb-3">🧊</span><h3 class="font-bold text-gray-800">Cold Storage</h3>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col items-center text-center cursor-pointer card-lift hover:border-orange-300" onclick="appState.navigate('logisticsDashboard', 'logistics')">
                    <span class="text-4xl mb-3">🚚</span><h3 class="font-bold text-gray-800">Logistics</h3>
                </div>
            </div>
        </div>
    `;
}

// Helper state for Farmer view toggling
let farmerViewState = 'situation'; // 'situation' or 'planner'
let farmerTabState = 'active'; // 'active' or 'history'
let dealerTabState = 'active'; // 'active' or 'completed'
let currentRecommendation = null;

window.handleHarvestPlan = function(event) {
    if (event) event.preventDefault();
    const cropSelect = document.getElementById('hpCrop').value;
    const crop = cropSelect === 'Other' ? document.getElementById('hpCropOther').value : cropSelect;
    const qtyNum = document.getElementById('hpQty').value;
    const qtyUnit = document.getElementById('hpUnit').value;
    const harvest_date = document.getElementById('hpDate').value;
    const village = document.getElementById('hpVillage').value;

    if (!crop || !qtyNum || !qtyUnit || !harvest_date || !village) {
        showToast("Please fill in all details, including the Harvest Date.", "error");
        return;
    }
    
    const quantity = `${qtyNum} ${qtyUnit}`;

    currentRecommendation = getRecommendation(crop);
    
    // Store temporarily in state so submitDraftRequest can access it
    appState.draftRequest = {
        crop, quantity, harvest_date, village,
        needs_storage: currentRecommendation.needs_storage
    };
    
    render();
};

window.submitDraftRequest = function(btn) {
    btn.disabled = true;
    btn.innerHTML = 'Publishing...';
    setTimeout(() => {
        appState.addRequest(appState.draftRequest);
        appState.draftRequest = null;
        currentRecommendation = null;
        farmerViewState = 'situation'; // Reset view
        // Render will be called by addRequest
    }, 800);
};


function renderFarmerDashboard() {
    const activeReqs = appState.requests.filter(r => r.status !== 'completed').map(req => {
        let offerHtml = '';
        if (req.status === 'submitted' && req.dealer_status.startsWith('offered_')) {
            const price = req.dealer_status.split('_')[1];
            offerHtml = `
                <div class="mt-4 bg-blue-50 border border-blue-100 rounded-lg p-4">
                    <h5 class="text-sm font-bold text-blue-800 uppercase tracking-wider mb-3">Incoming Dealer Offers</h5>
                    
                    <div class="bg-white border border-gray-200 rounded p-3 mb-2 flex justify-between items-center shadow-sm">
                        <div>
                            <p class="font-bold text-gray-800">Ramesh Traders <span class="text-xs bg-green-100 text-green-800 px-1 rounded ml-1">Verified</span></p>
                            <p class="text-xs text-gray-500">4 km away • Pickup: Today</p>
                        </div>
                        <div class="text-right">
                            <p class="font-bold text-lg text-primary">₹${price}/kg</p>
                        </div>
                    </div>
                    
                    <div class="bg-white border border-gray-200 rounded p-3 mb-4 flex justify-between items-center shadow-sm opacity-80">
                        <div>
                            <p class="font-bold text-gray-800">City Mandi Buyer</p>
                            <p class="text-xs text-gray-500">8 km away • Pickup: Tomorrow</p>
                        </div>
                        <div class="text-right">
                            <p class="font-bold text-lg text-gray-600">₹${parseInt(price)-1}/kg</p>
                        </div>
                    </div>
                    
                    <div class="flex gap-2">
                        <button onclick="appState.farmerRejectOffer('${req.id}')" class="w-1/3 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg text-sm hover:bg-gray-50 transition">Reject All</button>
                        <button onclick="appState.farmerAcceptOffer('${req.id}')" class="w-2/3 py-2 bg-blue-600 text-white font-bold rounded-lg text-sm shadow-sm hover:bg-blue-700 transition">Accept Ramesh Traders</button>
                    </div>
                </div>
            `;
        }

        return `
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4 border-l-4 border-l-primary">
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-gray-800 text-lg capitalize">${req.crop} <span class="text-sm font-normal text-gray-500">(${req.quantity})</span></h4>
                    <p class="text-sm text-gray-600 mt-1"><i class="fa-solid fa-location-dot mr-1"></i> ${req.village}</p>
                </div>
            </div>
            ${offerHtml}
            ${renderWorkflowTracker(req)}
        </div>
        `;
    }).join('');

    const completedReqs = appState.requests.filter(r => r.status === 'completed');
    let historyHtml = '';
    if (completedReqs.length > 0) {
        historyHtml = completedReqs.map(req => `
            <div class="bg-white border border-gray-100 rounded-lg p-5 shadow-sm flex justify-between items-center mb-4">
                <div>
                    <p class="font-bold text-lg text-gray-800 capitalize">${req.crop} <span class="text-sm text-gray-500 font-normal">(${req.quantity})</span></p>
                    <p class="text-xs text-gray-500 mt-1"><i class="fa-solid fa-location-dot mr-1"></i> ${req.village}</p>
                </div>
                <div class="text-right">
                    <span class="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded border border-green-200"><i class="fa-solid fa-check-double mr-1"></i> Completed</span>
                    <p class="text-[10px] text-gray-400 mt-2">Closed</p>
                </div>
            </div>
        `).join('');
    }

    return `
        <div class="animate-slide-up w-full max-w-7xl mx-auto">
            <div class="flex items-center justify-between mb-6">
                <h2 class="text-2xl font-bold text-gray-800">Farmer Command Center</h2>
                <div class="flex items-center space-x-3">
                    <button class="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm"><i class="fa-solid fa-bell mr-1"></i> Alerts</button>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                <!-- Left Sidebar: Market Intel -->
                <div class="lg:col-span-3 space-y-6">
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4"><i class="fa-solid fa-chart-line mr-1 text-primary"></i> Market Prices</h3>
                        <div class="space-y-3">
                            ${appState.marketPrices.map(m => `
                                <div class="flex justify-between items-center border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                                    <span class="font-semibold text-sm text-gray-700">${m.crop}</span>
                                    <span class="text-sm font-bold text-gray-900">${m.price}<span class="text-[10px] text-gray-400 font-normal">/${m.unit}</span></span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4"><i class="fa-solid fa-users mr-1 text-blue-500"></i> Nearby Dealers</h3>
                        <div class="space-y-3">
                            <div class="flex items-center">
                                <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs mr-3">RT</div>
                                <div>
                                    <p class="text-sm font-bold text-gray-800 leading-tight">Ramesh Traders</p>
                                    <p class="text-[10px] text-gray-500">4 km • Highly Active</p>
                                </div>
                            </div>
                            <div class="flex items-center">
                                <div class="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xs mr-3">CM</div>
                                <div>
                                    <p class="text-sm font-bold text-gray-800 leading-tight">City Mandi</p>
                                    <p class="text-[10px] text-gray-500">8 km • Buying Tomato</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Main Column: Actions & Workflows -->
                <div class="lg:col-span-6 space-y-6">
                    ${farmerViewState === 'situation' ? `
                        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
                            <div class="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-4"><i class="fa-solid fa-seedling"></i></div>
                            <h3 class="text-lg font-bold text-gray-800 mb-2">Ready to sell your harvest?</h3>
                            <p class="text-sm text-gray-500 mb-6">Enter your harvest details to generate a research-backed recommendation and get offers from nearby dealers.</p>
                            <button onclick="farmerViewState='planner'; render();" class="bg-primary hover:bg-primaryDark text-white font-bold py-3 px-6 rounded-lg transition shadow-md w-full max-w-sm">
                                Start Harvest Planner
                            </button>
                        </div>
                    ` : `
                        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                            <div class="flex justify-between items-center mb-6">
                                <h2 class="text-xl font-bold text-gray-800">Harvest Details</h2>
                                <button onclick="farmerViewState='situation'; render();" class="text-xs font-bold text-gray-400 hover:text-gray-600"><i class="fa-solid fa-xmark text-lg"></i></button>
                            </div>
                            <div id="harvest-form">
                                <div class="grid grid-cols-2 gap-4 mb-4">
                                    <div><label class="block text-xs font-semibold text-gray-500 uppercase mb-1">Crop</label>
                                    <select id="hpCrop" onchange="document.getElementById('hpCropOther').classList.toggle('hidden', this.value !== 'Other')" class="w-full border border-gray-300 rounded-md p-2 bg-gray-50 text-sm focus:border-primary focus:ring-1 focus:ring-primary" required>
                                        <option value="" disabled selected>Select Crop</option>
                                        <optgroup label="Vegetables">
                                            <option value="Tomato">Tomato</option>
                                            <option value="Potato">Potato</option>
                                            <option value="Onion">Onion</option>
                                            <option value="Cabbage">Cabbage</option>
                                            <option value="Cauliflower">Cauliflower</option>
                                            <option value="Brinjal">Brinjal</option>
                                            <option value="Capsicum">Capsicum</option>
                                            <option value="Chilli">Chilli</option>
                                            <option value="Beans">Beans</option>
                                            <option value="Carrot">Carrot</option>
                                            <option value="Beetroot">Beetroot</option>
                                            <option value="Cucumber">Cucumber</option>
                                        </optgroup>
                                        <optgroup label="Fruits">
                                            <option value="Mango">Mango</option>
                                            <option value="Banana">Banana</option>
                                            <option value="Grapes">Grapes</option>
                                            <option value="Papaya">Papaya</option>
                                        </optgroup>
                                        <optgroup label="Others">
                                            <option value="Ginger">Ginger</option>
                                            <option value="Turmeric">Turmeric</option>
                                            <option value="Other">Other (Manual)</option>
                                        </optgroup>
                                    </select>
                                    <input type="text" id="hpCropOther" class="hidden mt-2 w-full border border-gray-300 rounded-md p-2 bg-gray-50 text-sm focus:border-primary focus:ring-1 focus:ring-primary" placeholder="Enter crop name">
                                    </div>
                                    <div><label class="block text-xs font-semibold text-gray-500 uppercase mb-1">Quantity</label>
                                    <div class="flex gap-2">
                                        <input type="number" id="hpQty" class="w-1/2 border border-gray-300 rounded-md p-2 bg-gray-50 text-sm focus:border-primary focus:ring-1 focus:ring-primary" placeholder="e.g. 400" required>
                                        <select id="hpUnit" class="w-1/2 border border-gray-300 rounded-md p-2 bg-gray-50 text-sm focus:border-primary focus:ring-1 focus:ring-primary" required>
                                            <option value="kg">kg</option>
                                            <option value="Bags">Bags</option>
                                            <option value="Quintals">Quintals</option>
                                            <option value="Tons">Tons</option>
                                            <option value="Crates">Crates</option>
                                        </select>
                                    </div>
                                    </div>
                                </div>
                                <div class="grid grid-cols-2 gap-4 mb-4">
                                    <div><label class="block text-xs font-semibold text-gray-500 uppercase mb-1">Harvest Date</label>
                                    <input type="date" id="hpDate" class="w-full border border-gray-300 rounded-md p-2 bg-gray-50 text-sm focus:border-primary focus:ring-1 focus:ring-primary" required></div>
                                    <div><label class="block text-xs font-semibold text-gray-500 uppercase mb-1">Village</label>
                                    <select id="hpVillage" class="w-full border border-gray-300 rounded-md p-2 bg-gray-50 text-sm focus:border-primary focus:ring-1 focus:ring-primary" required>
                                        <option value="" disabled selected>Select Village</option>
                                        <option value="Anekal">Anekal</option>
                                        <option value="Jigani">Jigani</option>
                                        <option value="Attibele">Attibele</option>
                                        <option value="Sarjapur">Sarjapur</option>
                                    </select></div>
                                </div>

                                <button type="button" onclick="handleHarvestPlan(event)" class="w-full bg-dark hover:bg-gray-700 text-white font-medium py-3 rounded-md transition shadow-md">
                                    Generate Recommendation
                                </button>
                            </div>
                        </div>
                    `}

                    <div class="flex space-x-2 mb-6 border-b border-gray-200 pb-2">
                        <button onclick="farmerTabState='active'; render();" class="px-4 py-2 text-sm font-bold rounded-lg transition ${farmerTabState === 'active' ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-gray-500 hover:bg-gray-100'}">Active Orders</button>
                        <button onclick="farmerTabState='history'; render();" class="px-4 py-2 text-sm font-bold rounded-lg transition ${farmerTabState === 'history' ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-gray-500 hover:bg-gray-100'}">Order History</button>
                    </div>

                    ${farmerTabState === 'active' ? `
                        ${activeReqs.length > 0 ? `
                            <div>
                                ${activeReqs}
                            </div>
                        ` : '<div class="text-center p-8 bg-white shadow-sm rounded-xl border border-gray-200 text-gray-500 text-sm">No active orders found. Generate a recommendation to get started.</div>'}
                    ` : `
                        ${completedReqs.length > 0 ? `
                            <div>
                                ${historyHtml}
                            </div>
                        ` : '<div class="text-center p-8 bg-white shadow-sm rounded-xl border border-gray-200 text-gray-500 text-sm">No order history available.</div>'}
                    `}
                </div>

                <!-- Right Sidebar: Recommendation & History -->
                <div class="lg:col-span-3 space-y-6">
                    ${currentRecommendation ? `
                        <div class="animate-fade-in bg-white rounded-xl shadow-lg border-2 ${currentRecommendation.needs_storage ? 'border-green-400' : 'border-orange-400'} overflow-hidden sticky top-24">
                            <div class="p-4 bg-gray-50 border-b border-gray-100 flex items-center">
                                <span class="text-2xl mr-2">${currentRecommendation.icon}</span>
                                <h2 class="text-md font-bold text-gray-900 leading-tight">${currentRecommendation.title}</h2>
                            </div>
                            
                            <div class="p-4">
                                <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Reason</h3>
                                <ul class="space-y-1 mb-4">
                                    ${currentRecommendation.reasons.map(r => `<li class="flex items-center text-xs text-gray-700"><i class="fa-solid fa-check text-green-500 mr-1.5"></i> ${r}</li>`).join('')}
                                </ul>

                                <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Expected Flow</h3>
                                <div class="bg-blue-50 text-blue-800 p-2 rounded text-xs font-bold text-center mb-4">
                                    ${currentRecommendation.workflowVisual}
                                <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 mt-4">Estimated Timeline</h3>
                                <p class="text-sm font-bold text-gray-800 mb-4"><i class="fa-regular fa-clock text-blue-500 mr-1"></i> ${currentRecommendation.status === 'Immediate' ? 'Next 24-48 Hours' : 'Next 7-14 Days'}</p>

                                <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Next Step</h3>
                                <p class="text-sm font-bold text-gray-800 mb-6"><i class="fa-solid fa-arrow-right text-green-500 mr-1"></i> ${currentRecommendation.suggestedSteps[0]}</p>

                                <button onclick="submitDraftRequest(this)" class="w-full bg-primary hover:bg-primaryDark text-white font-bold py-2.5 rounded-lg transition shadow text-sm">
                                    Publish to Dealers
                                </button>
                            </div>
                        </div>
                    ` : `
                        <!-- Placeholder when no recommendation is active -->
                        <div class="bg-gray-50 border border-gray-200 border-dashed rounded-xl p-8 text-center flex flex-col items-center justify-center text-gray-400">
                            <i class="fa-solid fa-wand-magic-sparkles text-3xl mb-3"></i>
                            <p class="text-sm font-bold">Waiting for details</p>
                            <p class="text-xs mt-1">Submit your harvest plan to see AI recommendations here.</p>
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}


function renderDealerDashboard() {
    const rejectedIds = JSON.parse(localStorage.getItem('dealerRejected') || '[]');
    const opportunities = appState.requests.filter(r => r.status === 'submitted' && r.dealer_status === 'pending' && !rejectedIds.includes(r.id));
    
    // Split procurements based on dealerTabState
    const activeProcurements = appState.requests.filter(r => r.status === 'dealer_accepted');
    const completedProcurements = appState.requests.filter(r => r.status === 'completed');
    const procurementsToDisplay = dealerTabState === 'active' ? activeProcurements : completedProcurements;
    
    // KPI Data Calculations
    const kpiActive = activeProcurements.length;
    const kpiPending = appState.requests.filter(r => r.dealer_status.startsWith('offered_')).length;
    const kpiDeliveries = completedProcurements.length;
    let kpiRevenue = completedProcurements.reduce((acc, req) => {
        let p = req.dealer_status.includes('_') ? parseInt(req.dealer_status.split('_')[1]) : 18;
        let q = parseInt(req.quantity) || 100;
        return acc + (p * q);
    }, 0);
    
    let oppHtml = '';
    if (opportunities.length === 0) {
        oppHtml = `<div class="bg-white p-8 rounded-xl border border-gray-200 text-center text-gray-500 shadow-sm flex flex-col items-center"><i class="fa-solid fa-satellite-dish text-4xl mb-3 text-gray-300"></i><p>Scanning market... No new harvests available nearby.</p></div>`;
    } else {
        oppHtml = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">`;
        opportunities.forEach(req => {
            const distance = Math.floor(Math.random() * 15) + 2; // Mock distance
            const estValue = (parseInt(req.quantity) || 100) * 15; // Mock value
            
            oppHtml += `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-5 relative card-lift flex flex-col justify-between h-full">
                    <button onclick="appState.dealerRejectOffer('${req.id}')" class="absolute top-3 left-3 text-gray-300 hover:text-red-500 transition" title="Reject Request"><i class="fa-solid fa-xmark"></i></button>
                    <div>
                        <div class="absolute top-4 right-4 flex items-center bg-green-50 text-green-700 text-[10px] font-bold px-2 py-1 rounded border border-green-100">
                            <span class="w-2 h-2 rounded-full bg-green-500 mr-1 animate-pulse"></span> LIVE
                        </div>
                        <h3 class="text-lg font-bold text-gray-900 mb-1 capitalize mt-4">${req.crop}</h3>
                        <p class="text-xl text-primary font-bold mb-3">${req.quantity}</p>
                        
                        <div class="space-y-1 mb-4">
                            <p class="text-xs text-gray-600 flex justify-between"><span><i class="fa-solid fa-location-dot w-4 text-center text-gray-400"></i> ${req.village}</span> <span class="text-gray-400">~${distance} km</span></p>
                            <p class="text-xs text-gray-600 flex justify-between"><span><i class="fa-solid fa-calendar w-4 text-center text-gray-400"></i> Harvest</span> <span class="font-bold">${req.harvest_date}</span></p>
                            <p class="text-xs text-gray-600 flex justify-between"><span><i class="fa-solid fa-bolt w-4 text-center text-gray-400"></i> Urgency</span> <span class="text-orange-500 font-bold">Immediate Sale</span></p>
                            <p class="text-xs text-gray-600 flex justify-between"><span><i class="fa-solid fa-indian-rupee-sign w-4 text-center text-gray-400"></i> Est. Value</span> <span class="text-green-600 font-bold">₹${estValue.toLocaleString()}</span></p>
                            <p class="text-[10px] text-gray-400 mt-2">${req.needs_storage ? '<i class="fa-solid fa-snowflake mr-1"></i> Storage Required' : ''}</p>
                        </div>
                    </div>
                    
                    <div class="mt-auto border-t border-gray-100 pt-3">
                        <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Your Offer Price (₹/unit)</label>
                        <div class="flex items-center gap-2">
                            <input type="number" id="offer-${req.id}" placeholder="e.g. 18" class="w-1/2 border border-gray-300 rounded p-2 text-center font-bold text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required>
                            <button onclick="appState.dealerMakeOffer('${req.id}')" class="w-1/2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded transition shadow-sm text-sm">
                                Make Offer
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        oppHtml += `</div>`;
    }

    let procHtml = '';
    if (procurementsToDisplay.length === 0) {
        procHtml = `<div class="bg-gray-50 p-6 rounded-xl border border-gray-200 border-dashed text-center text-gray-400 text-sm shadow-sm">No ${dealerTabState} procurements found.</div>`;
    } else {
        procHtml = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">`;
        procurementsToDisplay.forEach(req => {
            const tStatus = req.transport_status;
            const sStatus = req.storage_status;
            const price = req.dealer_status.includes('_') ? req.dealer_status.split('_')[1] : '18';
            
            procHtml += `
                <div class="bg-white border-l-4 ${req.status === 'completed' ? 'border-l-green-500' : 'border-l-blue-500'} rounded-xl p-5 shadow-sm border border-gray-200 flex flex-col justify-between h-full">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <p class="font-bold text-gray-900 text-lg capitalize">${req.crop} <span class="text-gray-500 font-normal text-sm">(${req.quantity})</span></p>
                            <p class="text-sm text-gray-600"><i class="fa-solid fa-location-dot w-4"></i> ${req.village}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-sm font-bold text-gray-800">₹${price}/kg</p>
                            <span class="text-[10px] uppercase font-bold text-gray-400">Winning Bid</span>
                        </div>
                    </div>
                    
                    ${req.status === 'completed' ? `
                        <div class="mt-auto bg-green-50 text-green-800 text-center py-2 rounded font-bold text-sm border border-green-100">
                            <i class="fa-solid fa-check-circle mr-1"></i> Delivery Completed
                        </div>
                    ` : `
                        <div class="mt-auto grid grid-cols-2 gap-2">
                            ${req.needs_storage ? `
                                <button 
                                    onclick="${sStatus === 'none' ? `appState.dealerReserveStorage('${req.id}')` : ''}" 
                                    class="w-full py-2 rounded text-xs font-bold shadow-sm transition flex flex-col items-center justify-center h-14 ${sStatus === 'none' ? 'bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100' : 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed'}"
                                    ${sStatus !== 'none' ? 'disabled' : ''}>
                                    <i class="fa-solid fa-snowflake mb-1 text-sm"></i> 
                                    ${sStatus === 'none' ? 'Request Storage' : sStatus === 'requested' ? 'Pending Approval' : 'Storage Confirmed'}
                                </button>
                            ` : `<div class="bg-gray-50 border border-gray-100 rounded flex flex-col items-center justify-center h-14 text-gray-400 text-xs font-bold"><i class="fa-solid fa-ban mb-1"></i> No Storage Req.</div>`}
                            
                            <button 
                                onclick="${tStatus === 'none' ? `appState.dealerBookLogistics('${req.id}')` : ''}" 
                                class="w-full py-2 rounded text-xs font-bold shadow-sm transition flex flex-col items-center justify-center h-14 ${tStatus === 'none' ? 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100' : 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed'}"
                                ${tStatus !== 'none' ? 'disabled' : ''}>
                                <i class="fa-solid fa-truck mb-1 text-sm"></i> 
                                ${tStatus === 'none' ? 'Book Transport' : tStatus === 'requested' ? 'Transport Requested' : 'Transport Confirmed'}
                            </button>
                        </div>
                    `}
                </div>
            `;
        });
        procHtml += `</div>`;
    }

    return `
        <div class="animate-slide-up w-full max-w-7xl mx-auto">
            <div class="flex justify-between items-end mb-6">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800">Dealer Command Center</h2>
                    <p class="text-sm text-gray-500 mt-1">Manage procurement bids and coordinate downstream supply chain.</p>
                </div>
                <div class="hidden md:flex space-x-2">
                    <button class="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-gray-50"><i class="fa-solid fa-filter mr-1"></i> Filter</button>
                    <button class="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-gray-50"><i class="fa-solid fa-chart-bar mr-1"></i> Analytics</button>
                </div>
            </div>

            <!-- KPI Summary Cards -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 border-l-4 border-l-blue-500">
                    <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Active Procurements</p>
                    <p class="text-2xl font-black text-gray-800">${kpiActive}</p>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 border-l-4 border-l-orange-400">
                    <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Pending Offers</p>
                    <p class="text-2xl font-black text-gray-800">${kpiPending}</p>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 border-l-4 border-l-green-500">
                    <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Deliveries Completed</p>
                    <p class="text-2xl font-black text-gray-800">${kpiDeliveries}</p>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 border-l-4 border-l-primary">
                    <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Est. Revenue</p>
                    <p class="text-2xl font-black text-gray-800">₹${kpiRevenue.toLocaleString()}</p>
                </div>
            </div>

            <div class="mb-10">
                <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center"><i class="fa-solid fa-broadcast-tower text-blue-500 mr-2"></i> Market Opportunities</h3>
                ${oppHtml}
            </div>

            <div>
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-gray-800 flex items-center"><i class="fa-solid fa-box-check text-green-500 mr-2"></i> My Procurements</h3>
                    <div class="flex space-x-2">
                        <button onclick="dealerTabState='active'; render();" class="px-3 py-1 text-xs font-bold rounded-lg transition ${dealerTabState === 'active' ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-gray-500 hover:bg-gray-100'}">Active</button>
                        <button onclick="dealerTabState='completed'; render();" class="px-3 py-1 text-xs font-bold rounded-lg transition ${dealerTabState === 'completed' ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-gray-500 hover:bg-gray-100'}">Completed</button>
                    </div>
                </div>
                ${procHtml}
            </div>
        </div>
    `;
}


function renderLogisticsDashboard() {
    const assigned = appState.requests.filter(r => r.transport_status === 'requested');
    const active = appState.requests.filter(r => r.transport_status === 'confirmed');
    
    let html = `
        <div class="animate-slide-up w-full max-w-7xl mx-auto">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-800">Logistics Fleet Manager</h2>
                <div class="bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm flex items-center">
                    <span class="text-xs font-bold text-gray-500 uppercase mr-3">Fleet Utilization</span>
                    <div class="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div class="w-[65%] h-full bg-orange-500"></div>
                    </div>
                    <span class="ml-3 font-bold text-orange-600 text-sm">65%</span>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <!-- Left: Visual Map -->
                <div class="lg:col-span-7">
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-2 h-full min-h-[400px] flex flex-col">
                        <div class="p-3 border-b border-gray-100 flex justify-between items-center">
                            <h3 class="text-sm font-bold text-gray-800">Live Route Map</h3>
                            <span class="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">2 Drivers Active</span>
                        </div>
                        <div class="flex-grow bg-blue-50 rounded-lg relative overflow-hidden flex items-center justify-center border border-blue-100 mt-2">
                            <!-- Map Placeholder Visual -->
                            <div class="absolute inset-0 opacity-20" style="background-image: radial-gradient(#cbd5e1 1px, transparent 1px); background-size: 20px 20px;"></div>
                            <div class="text-center z-10">
                                <div class="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center mx-auto mb-2 border border-blue-200">
                                    <i class="fa-solid fa-map-location-dot text-blue-500 text-xl"></i>
                                </div>
                                <p class="text-sm font-bold text-blue-900">Map Integration</p>
                                <p class="text-xs text-blue-700 mt-1">Routes will be visualized here.</p>
                            </div>
                            
                            <!-- Mock Map Pins -->
                            <div class="absolute top-1/4 left-1/4 transform -translate-x-1/2 -translate-y-1/2 text-orange-500 animate-bounce">
                                <i class="fa-solid fa-location-dot text-2xl drop-shadow-md"></i>
                            </div>
                            <div class="absolute bottom-1/3 right-1/4 transform -translate-x-1/2 -translate-y-1/2 text-green-600">
                                <i class="fa-solid fa-location-dot text-2xl drop-shadow-md"></i>
                            </div>
                            <svg class="absolute inset-0 w-full h-full pointer-events-none" style="z-index: 1;">
                                <path d="M 25% 25% Q 50% 10% 75% 66%" fill="none" stroke="#f97316" stroke-width="3" stroke-dasharray="6,6" class="opacity-50" />
                            </svg>
                        </div>
                    </div>
                </div>

                <!-- Right: Jobs -->
                <div class="lg:col-span-5 space-y-6">
                    
                    <!-- Pending Jobs -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[50%]">
                        <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <h3 class="text-sm font-bold text-gray-800">Pending Pickups</h3>
                            <span class="bg-orange-100 text-orange-800 text-xs font-bold px-2 py-0.5 rounded-full">${assigned.length}</span>
                        </div>
                        <div class="p-4 overflow-y-auto flex-grow">
    `;

    if (assigned.length === 0) {
        html += `<div class="h-full flex items-center justify-center text-center text-sm text-gray-400 py-8">No pending transport requests.</div>`;
    } else {
        if (assigned.length > 1) {
            html += `
                <div class="mb-4 bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-800 flex items-start">
                    <i class="fa-solid fa-lightbulb text-yellow-500 mt-0.5 mr-2"></i>
                    <div>
                        <strong class="block mb-1">Consolidation Opportunity</strong>
                        You have ${assigned.length} pickups in the same zone. Combine loads to save ~24% on fuel.
                    </div>
                </div>
            `;
        }
        assigned.forEach(req => {
            const distance = Math.floor(Math.random() * 20) + 10;
            const cost = distance * 45;
            const eta = Math.floor(Math.random() * 45) + 15;
            const vehicle = parseInt(req.quantity) > 50 ? 'Medium Truck' : 'Mini Truck';
            
            html += `
                <div class="border border-gray-200 rounded-lg p-4 mb-3 hover:border-orange-300 transition shadow-sm bg-white">
                    <div class="flex justify-between items-start mb-3 border-b border-gray-100 pb-2">
                        <div>
                            <p class="font-bold text-gray-900 text-sm capitalize">${req.crop} <span class="text-primary ml-1">${req.quantity}</span></p>
                        </div>
                        <span class="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">Requires ${vehicle}</span>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-y-2 text-xs text-gray-600 mb-4">
                        <p><i class="fa-solid fa-arrow-up-from-bracket w-4 text-center text-gray-400"></i> <span class="font-bold text-gray-800">${req.village}</span></p>
                        <p><i class="fa-solid fa-arrow-right-to-bracket w-4 text-center text-gray-400"></i> <span class="font-bold text-gray-800">Dealer Warehouse</span></p>
                        <p><i class="fa-solid fa-route w-4 text-center text-gray-400"></i> ${distance} km</p>
                        <p><i class="fa-solid fa-indian-rupee-sign w-4 text-center text-gray-400"></i> Est. ₹${cost}</p>
                        <p class="col-span-2 text-blue-600 font-bold"><i class="fa-regular fa-clock w-4 text-center"></i> ETA: ${eta} mins</p>
                    </div>

                    <div class="flex gap-2">
                        <button onclick="appState.logisticsReject('${req.id}')" class="w-1/3 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-xs font-bold py-2 rounded transition">
                            Reject
                        </button>
                        <button onclick="appState.logisticsConfirm('${req.id}')" class="w-2/3 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-2 rounded shadow-sm transition">
                            Accept Job
                        </button>
                    </div>
                </div>
            `;
        });
    }
    
    html += `
                        </div>
                    </div>

                    <!-- Active Trips -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[50%]">
                        <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <h3 class="text-sm font-bold text-gray-800">Active Deliveries</h3>
                            <span class="bg-green-100 text-green-800 text-xs font-bold px-2 py-0.5 rounded-full">${active.length}</span>
                        </div>
                        <div class="p-4 overflow-y-auto flex-grow">
    `;
    
    if (active.length === 0) {
        html += `<div class="h-full flex items-center justify-center text-center text-sm text-gray-400 py-8">No trucks currently on route.</div>`;
    } else {
        active.forEach(req => {
            html += `
                <div class="border border-green-200 bg-green-50 rounded-lg p-3 mb-3">
                    <div class="flex justify-between items-center mb-2">
                        <div>
                            <p class="font-bold text-gray-900 text-sm capitalize">${req.crop} <span class="text-primary">${req.quantity}</span></p>
                            <p class="text-xs text-gray-600"><i class="fa-solid fa-truck-fast w-3"></i> En route to Dealer/Storage</p>
                        </div>
                        <button onclick="appState.logisticsComplete('${req.id}')" class="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1.5 px-3 rounded shadow-sm transition">
                            Complete
                        </button>
                    </div>
                </div>
            `;
        });
    }

    html += `
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    return html;
}


function renderStorageDashboard() {
    const reservations = appState.requests.filter(r => r.storage_status === 'requested');
    const approved = appState.requests.filter(r => r.storage_status === 'approved' || r.status === 'completed');
    
    let html = `
        <div class="animate-slide-up w-full max-w-7xl mx-auto">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-800">Cold Storage Management</h2>
                <div class="flex space-x-2">
                    <button class="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded text-sm font-bold shadow-sm hover:bg-gray-50"><i class="fa-solid fa-file-invoice mr-1"></i> Billing</button>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <!-- Left Sidebar: Facility Status -->
                <div class="lg:col-span-4 space-y-6">
                    <!-- Capacity -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div class="flex justify-between items-end mb-3">
                            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Facility Capacity</h3>
                            <span class="text-2xl font-bold text-cyan-600">85%</span>
                        </div>
                        <div class="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
                            <div class="w-[85%] h-full bg-cyan-500"></div>
                        </div>
                        <p class="text-xs text-gray-500 text-right">150 MT Available</p>
                    </div>

                    <!-- Calendar Placeholder -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div class="bg-gray-50 p-3 border-b border-gray-100">
                            <h3 class="text-xs font-bold text-gray-600 uppercase text-center"><i class="fa-regular fa-calendar mr-1"></i> Arrivals Schedule</h3>
                        </div>
                        <div class="p-4 flex justify-center items-center h-40 opacity-60">
                            <div class="text-center">
                                <div class="grid grid-cols-7 gap-1 text-[10px] text-gray-400 font-bold mb-1">
                                    <div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div>
                                </div>
                                <div class="grid grid-cols-7 gap-1 text-xs">
                                    <div class="w-6 h-6 flex items-center justify-center text-gray-300">28</div>
                                    <div class="w-6 h-6 flex items-center justify-center text-gray-300">29</div>
                                    <div class="w-6 h-6 flex items-center justify-center bg-gray-100 rounded">30</div>
                                    <div class="w-6 h-6 flex items-center justify-center bg-cyan-100 text-cyan-700 font-bold rounded">1</div>
                                    <div class="w-6 h-6 flex items-center justify-center hover:bg-gray-50 rounded cursor-pointer">2</div>
                                    <div class="w-6 h-6 flex items-center justify-center hover:bg-gray-50 rounded cursor-pointer">3</div>
                                    <div class="w-6 h-6 flex items-center justify-center hover:bg-gray-50 rounded cursor-pointer">4</div>
                                </div>
                                <p class="text-[10px] text-cyan-600 font-bold mt-3">2 Arrivals Today</p>
                            </div>
                        </div>
                    </div>

                    <!-- Rates & Crops -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Storage Policies</h3>
                        <div class="flex justify-between items-center border-b border-gray-100 pb-2 mb-2 text-sm">
                            <span class="text-gray-600 font-medium">Standard Rate</span>
                            <span class="font-bold text-gray-800">₹2 /kg /month</span>
                        </div>
                        <div class="flex justify-between items-center text-sm mb-4">
                            <span class="text-gray-600 font-medium">Supported</span>
                            <span class="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-100">Potato, Onion</span>
                        </div>
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-gray-600 font-medium">Unsupported</span>
                            <span class="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-100">Tomato, Leafy</span>
                        </div>
                    </div>
                </div>

                <!-- Main: Reservations -->
                <div class="lg:col-span-8 space-y-6">
                    
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200">
                        <div class="p-5 border-b border-gray-100 bg-gray-50 rounded-t-xl flex justify-between items-center">
                            <h3 class="text-lg font-bold text-gray-800">Pending Reservations</h3>
                            <span class="bg-cyan-100 text-cyan-800 text-xs font-bold px-2 py-1 rounded-full">${reservations.length} Pending</span>
                        </div>
                        <div class="p-5">
    `;

    if (reservations.length === 0) {
        html += `<div class="py-10 text-center text-gray-400 font-medium">No new reservation requests.</div>`;
    } else {
        html += `<div class="space-y-4">`;
        reservations.forEach(req => {
            const temp = req.crop.toLowerCase().includes('potato') ? '2-4°C' : '0-2°C';
            const duration = Math.floor(Math.random() * 3) + 1; // 1-3 months
            
            html += `
                <div class="border border-gray-200 rounded-xl p-5 hover:border-cyan-300 transition shadow-sm bg-white">
                    <div class="flex flex-col md:flex-row justify-between md:items-start gap-4">
                        <div class="flex-grow">
                            <div class="flex justify-between items-start mb-3 border-b border-gray-100 pb-3">
                                <div>
                                    <p class="font-bold text-gray-900 capitalize text-lg leading-none">${req.crop} <span class="text-cyan-600 text-sm ml-1">${req.quantity}</span></p>
                                    <p class="text-xs text-gray-500 mt-1"><i class="fa-solid fa-user text-gray-400 w-3"></i> Ramesh Traders (Dealer)</p>
                                </div>
                                <span class="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-1 rounded border border-blue-200">New Request</span>
                            </div>
                            
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600 mb-4">
                                <div><p class="text-[10px] text-gray-400 uppercase font-bold">Temp. Req.</p><p class="font-bold text-gray-800">${temp}</p></div>
                                <div><p class="text-[10px] text-gray-400 uppercase font-bold">Duration</p><p class="font-bold text-gray-800">${duration} Months</p></div>
                                <div><p class="text-[10px] text-gray-400 uppercase font-bold">Storage Rate</p><p class="font-bold text-gray-800">₹2/kg/mo</p></div>
                                <div><p class="text-[10px] text-gray-400 uppercase font-bold">Facility Load</p><p class="font-bold text-cyan-600">85% Full</p></div>
                            </div>
                        </div>
                        
                        <div class="flex flex-col gap-2 min-w-[120px] justify-center border-l md:border-l-gray-100 md:pl-4 pt-4 md:pt-0 border-t md:border-t-0 border-t-gray-100">
                            <button onclick="appState.storageAccept('${req.id}')" class="w-full py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-sm rounded transition shadow-sm">Approve</button>
                            <button onclick="appState.storageReject('${req.id}')" class="w-full py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold text-sm rounded transition shadow-sm">Reject</button>
                        </div>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    html += `
                        </div>
                    </div>

                    <div class="bg-white rounded-xl shadow-sm border border-gray-200">
                        <div class="p-5 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                            <h3 class="text-lg font-bold text-gray-800">Approved Log</h3>
                        </div>
                        <div class="p-5">
    `;

    if (approved.length === 0) {
        html += `<div class="py-6 text-center text-gray-400 text-sm">No recent approved reservations.</div>`;
    } else {
        html += `<div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
                <thead>
                    <tr class="text-gray-400 border-b border-gray-100">
                        <th class="pb-2 font-semibold">ID</th>
                        <th class="pb-2 font-semibold">Crop</th>
                        <th class="pb-2 font-semibold">Client</th>
                        <th class="pb-2 font-semibold">Status</th>
                    </tr>
                </thead>
                <tbody>
        `;
        approved.forEach(req => {
            html += `
                    <tr class="border-b border-gray-50 last:border-0">
                        <td class="py-3 text-gray-500 font-mono text-xs">#${String(req.id).slice(-4)}</td>
                        <td class="py-3 font-bold text-gray-800 capitalize">${req.crop} <span class="text-xs font-normal text-gray-500">(${req.quantity})</span></td>
                        <td class="py-3 text-gray-600">Ramesh Traders</td>
                        <td class="py-3"><span class="bg-green-50 text-green-700 px-2 py-1 rounded text-xs font-bold border border-green-100">Approved</span></td>
                    </tr>
            `;
        });
        html += `</tbody></table></div>`;
    }

    html += `
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    return html;
}

// --- RENDERING LOGIC ---

function renderHeader() {
    const navActions = document.getElementById('nav-actions');
    const roleLabel = document.getElementById('current-role-label');
    const badge = document.getElementById('notif-badge');

    if (appState.currentUserRole) {
        navActions.classList.remove('hidden');
        roleLabel.innerText = appState.currentUserRole.charAt(0).toUpperCase() + appState.currentUserRole.slice(1);
        
        if (appState.unreadCount > 0) {
            badge.innerText = appState.unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } else {
        navActions.classList.add('hidden');
    }
}

function render() {
    renderHeader();
    appState.unreadCount = 0; // Clear badge on view change for demo purposes
    renderHeader();

    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = ''; 
    
    switch (appState.currentView) {
        case 'landing': mainContent.innerHTML = renderLanding(); break;
        case 'farmerDashboard': mainContent.innerHTML = renderFarmerDashboard(); break;
        case 'dealerDashboard': mainContent.innerHTML = renderDealerDashboard(); break;
        case 'logisticsDashboard': mainContent.innerHTML = renderLogisticsDashboard(); break;
        case 'storageDashboard': mainContent.innerHTML = renderStorageDashboard(); break;
        default: mainContent.innerHTML = renderLanding();
    }
}

// Run initialization directly since script is at end of body
appState.loadRequests(); 
render();
