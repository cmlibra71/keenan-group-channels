"use client";

import { useState, useMemo } from "react";
import { Search, ExternalLink } from "lucide-react";

type WarrantyEntry = {
  brand: string;
  claimAction: string;
  claimUrl?: string;
  warranty: string;
  registration: string;
  service: string;
  equipment: string;
};

const WARRANTY_DATA: WarrantyEntry[] = [
  { brand: "3MONKEEZ", claimAction: "Contact Us", warranty: "12m\u201360m (product dependent); 24m tapware", registration: "Registration required \u2014 contact us", service: "Australia-wide; free replacement part shipping; on-site via arrangement", equipment: "Tapware, waste, plumbing" },
  { brand: "A&D Weighing", claimAction: "Start Claim", claimUrl: "https://www.aandd.com.au/support/warranty-claim/", warranty: "12m\u20135yr (model dependent)", registration: "Registration", service: "R2B; return freight at customer cost; warranty return shipping covered", equipment: "Commercial scales" },
  { brand: "ACE Filters", claimAction: "Contact Us", warranty: "12m P&L; Miracle powder 36m shelf life", registration: "\u2014", service: "Australia-wide; on-site where available; R2B option; 24hr response", equipment: "Filter machines, powder" },
  { brand: "Adande / Stoddart", claimAction: "Start Claim", claimUrl: "https://www.stoddart.com.au/warranty/", warranty: "24m P&L; parts 60m", registration: "Registration within 90 days for 60m parts", service: "On-site \u226450km from service agent; regional travel at agent\u2019s rates", equipment: "Refrigerated drawers" },
  { brand: "AG Equipment", claimAction: "Start Claim", claimUrl: "https://www.agequipment.com.au/warranty", warranty: "12m\u201324m (model dependent)", registration: "Registration required", service: "Australia-wide; on-site via technician; no travel charges under warranty", equipment: "Cooking, refrigeration" },
  { brand: "Alto-Shaam", claimAction: "Start Claim", claimUrl: "https://www.alto-shaam.com/en/service-support/warranty-claims", warranty: "15m from install (or 15m from ship) P&L; compressor 5yr; Halo Heat elements lifetime", registration: "Registration", service: "On-site via AU service network", equipment: "Combi, cook & hold, heated cabinets" },
  { brand: "Apuro", claimAction: "Contact Us", warranty: "24m P&L", registration: "\u2014", service: "Via Uropa warranty service (1300 225 960). Credit card details required before any warranty service. On-site or R2B depending on item.", equipment: "Benchtop cooking, prep, vac packers" },
  { brand: "Asahi (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "R2B: 13m parts + 13m labour", registration: "\u2014", service: "Return to base", equipment: "Rice cookers" },
  { brand: "Atlas (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "15-year components (rust/corrosion)", registration: "\u2014", service: "Install/environmental damage excluded", equipment: "Shelving components" },
  { brand: "Australian Bakery & Pizza (ABP Atlas)", claimAction: "Warranty Info", warranty: "Per ABP Atlas T&Cs", registration: "\u2014", service: "Via authorised service agents; environmental/transit damage excluded", equipment: "Bakery equipment, sheeters, ovens" },
  { brand: "B+S", claimAction: "Start Claim", warranty: "Rapid 24m; K+ 18m; Black 24m; Verro 24m (reverts to 12m P&L without activation form)", registration: "Registration required", service: "On-site AU-wide via agents; travel >100 km chargeable; 8am\u20134pm AEDST", equipment: "Asian cooking, induction, fryers" },
  { brand: "BakerMAX (FED)", claimAction: "Start Claim", warranty: "12m P&L", registration: "\u2014", service: "On-site metro where available; some R2B", equipment: "Bakery line" },
  { brand: "BenchFoods (Commercial Dehydrators)", claimAction: "Warranty Info", warranty: "5 years", registration: "\u2014", service: "AU-wide; local tech reimbursed if no BenchFoods tech nearby", equipment: "Commercial dehydrators" },
  { brand: "Benchstar (FED)", claimAction: "Start Claim", warranty: "12m P&L", registration: "\u2014", service: "On-site metro where available; some R2B", equipment: "Benchtop equipment" },
  { brand: "Birko / Zip Taps", claimAction: "Book a Service", warranty: "12m P&L", registration: "Registration recommended", service: "On-site; mileage/travel charges may apply; filter cartridge life excluded", equipment: "Boiling water units, chilled water systems" },
  { brand: "Blue Seal (Moffat)", claimAction: "Start Claim", claimUrl: "https://www.mfrbrands.com.au/service-and-warranty/warranty-claim/", warranty: "24m P&L (products from 1 Sep 2024); 12m prior", registration: "\u2014", service: "On-site metro; regional $2.13/km round trip", equipment: "Cooking equipment" },
  { brand: "Bonn (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "Performance models: 24m parts / 13m labour. Light duty (CM-902T): 13m parts / 13m labour. All R2B except CM-2100G & CM-1401TG (on-site).", registration: "\u2014", service: "R2B standard; on-site for large units \u226450 km from service agent", equipment: "Commercial microwaves" },
  { brand: "Bromic Heating", claimAction: "Start Claim", warranty: "Product-line dependent (see bromic.com.au/warranty)", registration: "\u2014", service: "Via Bromic AU network", equipment: "Outdoor heaters, heating panels" },
  { brand: "Bromic Refrigeration", claimAction: "Start Claim", warranty: "5yr (60m) P&L \u2014 Extra Care warranty, entire range. Spare parts: 3m (if installed by licensed tech).", registration: "No registration required \u2014 automatic from purchase date", service: "On-site via AU-wide technician network; after-hours available (Bromic covers standard call-out + parts; customer pays after-hours surcharge)", equipment: "Refrigeration \u2014 full commercial range" },
  { brand: "Carpigiani (Majors Group / Freezo)", claimAction: "Contact Distributor", warranty: "12m from date of delivery", registration: "\u2014", service: "Gelato & batch freezers via Majors Group. Soft serve machines via Freezo. Contact relevant distributor for service.", equipment: "Gelato, batch freezers, soft serve" },
  { brand: "Cleveland (Comcater)", claimAction: "Start Claim", claimUrl: "https://www.comcater.com.au/service-support/", warranty: "12m P&L", registration: "\u2014", service: "On-site metro; regional travel charges", equipment: "Steamers, kettles" },
  { brand: "Cobra (Moffat)", claimAction: "Start Claim", claimUrl: "https://www.mfrbrands.com.au/service-and-warranty/warranty-claim/", warranty: "24m P&L (products from 1 Sep 2024); 12m prior", registration: "\u2014", service: "On-site metro; regional $2.13/km round trip", equipment: "Cooking line" },
  { brand: "Convotherm (Moffat)", claimAction: "Start Claim", claimUrl: "https://www.mfrbrands.com.au/service-and-warranty/warranty-claim/", warranty: "24m P&L (products from 1 Sep 2024); 12m prior", registration: "\u2014", service: "On-site metro; regional $2.13/km round trip", equipment: "Combi ovens" },
  { brand: "Cossiga", claimAction: "Start Claim", claimUrl: "https://cossiga.au/pages/service", warranty: "24m P&L", registration: "\u2014", service: "On-site via Cossiga AU service partners", equipment: "Food display cabinets (hot & cold)" },
  { brand: "Crown Industries", claimAction: "Start Claim", warranty: "CRN 12m; HW/CM/SC 24m; SD2 12m", registration: "Registration recommended", service: "End user deals directly with Crown for all warranty; on-site or R2B", equipment: "Urns, coffee makers, steamers, decanter warmers" },
  { brand: "CyberChill", claimAction: "Start Claim", warranty: "24m P&L (metro \u226450 km); 12m merchandisers; cold rooms 12m parts only", registration: "Registration required", service: "CyberChill certified techs only; after-hours chargeable; 8:30am\u20134pm Mon\u2013Fri", equipment: "Refrigeration, merchandisers, cold rooms" },
  { brand: "Dito Sama (Electrolux Professional)", claimAction: "Start Claim", claimUrl: "https://www.electroluxprofessional.com/au/support/warranty/", warranty: "24m P&L", registration: "\u2014", service: "Via Electrolux Professional AU service network", equipment: "Food processors, veg prep, mixers" },
  { brand: "Edlund (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "13m P&L (excl. Crown Punch)", registration: "\u2014", service: "On-site \u226450 km; otherwise charges/R2B", equipment: "Prep tools & equipment" },
  { brand: "Electrolux Professional", claimAction: "Start Claim", claimUrl: "https://www.electroluxprofessional.com/au/support/warranty/", warranty: "24m P&L (AU online store purchases). Confirm warranty period with your distributor for dealer-purchased units.", registration: "\u2014", service: "On-site via Electrolux Professional AU-wide network. Proof of purchase required. Nationwide coverage.", equipment: "Cooking, refrigeration, dishwashing, laundry" },
  { brand: "EMAINOX (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "13m P&L", registration: "\u2014", service: "On-site \u226450 km; otherwise charges/R2B", equipment: "Display & service" },
  { brand: "Eswood (Middleby)", claimAction: "Book Warranty Service", warranty: "12m P&L", registration: "Registration available", service: "On-site; travel charged >100 km from metro/provider (8\u20134)", equipment: "Dishwashers" },
  { brand: "EuroChef", claimAction: "Contact Us", warranty: "12m standard; 90 days commercial use; some models 24m", registration: "\u2014", service: "Service via 13 13 49; regional travel may apply", equipment: "Cooking equipment, induction" },
  { brand: "Euroquip / Moretti Forni", claimAction: "Find a Dealer", warranty: "24m standard; Serie S / Neapolis / Serie T 60m", registration: "\u2014", service: "Via authorised Euroquip dealers AU-wide", equipment: "Conveyor ovens, deck ovens, pizza ovens" },
  { brand: "Exquisite", claimAction: "Contact Us", warranty: "Varies by model (see pricelist)", registration: "\u2014", service: "Email warranty@exquisiteaust.com.au with model, serial, address, fault description", equipment: "Refrigeration, display" },
  { brand: "FED-X", claimAction: "Start Claim", warranty: "12m P&L", registration: "\u2014", service: "On-site metro where available; some R2B; regional travel may apply", equipment: "Bench fridges, uprights, counters, freezers" },
  { brand: "Firex (Middleby)", claimAction: "Book Warranty Service", warranty: "12m P&L", registration: "Registration available", service: "On-site; travel charged >100 km", equipment: "Cookers, kettles" },
  { brand: "Frymaster (Comcater)", claimAction: "Start Claim", claimUrl: "https://www.comcater.com.au/service-support/", warranty: "12m P&L (frypot mat./welds up to 120m)", registration: "\u2014", service: "On-site metro; regional travel charges", equipment: "Deep fryers" },
  { brand: "FryMax (FED)", claimAction: "Start Claim", warranty: "12m P&L", registration: "\u2014", service: "On-site metro where available; some R2B", equipment: "Fryers & filtration" },
  { brand: "Garland (Comcater)", claimAction: "Start Claim", claimUrl: "https://www.comcater.com.au/service-support/", warranty: "12m P&L", registration: "\u2014", service: "On-site metro; regional travel charges", equipment: "Ranges, ovens, grills" },
  { brand: "GBG (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "13m P&L", registration: "\u2014", service: "On-site \u226450 km; otherwise charges/R2B", equipment: "Granita & beverage" },
  { brand: "Giorik (Stoddart)", claimAction: "Start Claim", claimUrl: "https://www.stoddart.com.au/warranty/", warranty: "Combi ovens: 24m P&L (strict conditions). Modular & salamanders: 24m P&L with registration within 90 days.", registration: "Registration within 90 days required", service: "Combi conditions: must use Stoddart-recommended chemicals, replace water filters every 6\u201312m, commit to annual planned maintenance (customer\u2019s cost).", equipment: "Combi ovens, modular cooking, salamanders" },
  { brand: "Goldstein (Middleby)", claimAction: "Book Warranty Service", warranty: "12m P&L (SW400/SW500: 24m with registration)", registration: "Registration available", service: "On-site; travel charged >100 km; 2hr travel covered under warranty", equipment: "Cooking (AU made)" },
  { brand: "Hallde (Roband)", claimAction: "Start Claim", warranty: "12m P&L", registration: "\u2014", service: "Via Roband AU service network. Service: 1300 365 769. Must have authorisation before repairs.", equipment: "Food processors, veg prep" },
  { brand: "Hatco (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "R2B for GR-FFB, GMFFL, TPT-230-4-10, RCTHW-1E; others typically 13m P&L", registration: "\u2014", service: "R2B for listed models", equipment: "Warmers & heat lamps" },
  { brand: "Henkelman (Sous Vide Australia)", claimAction: "Contact Sous Vide AU", warranty: "36m (3yr). Wear parts excluded (oil, gaskets, sealing wire, lid seal, tape).", registration: "\u2014", service: "Via Sous Vide Australia. Parts dispatched from Netherlands within 24hrs. Available for 10yr after production ceases.", equipment: "Vacuum packing machines" },
  { brand: "Henny Penny", claimAction: "Start Claim", warranty: "AU: 24m parts / 12m labour. Frypot warranty up to 84m (36m P&L + credit thereafter). Registration within 10 days of install.", registration: "Registration required", service: "On-site via AU distributor; professional startup service included and required to validate warranty. Baskets, lamps, fuses excluded.", equipment: "Pressure fryers, open fryers, holding cabinets, combi ovens" },
  { brand: "Hobart (AU)", claimAction: "Start Claim", warranty: "12m P&L standard; some models 24m", registration: "\u2014", service: "On-site via Hobart Service; after-hours 1800 462 278 (call-out fee applies even under warranty)", equipment: "Dishwashers & prep" },
  { brand: "Hoshizaki / Lancer", claimAction: "Start Claim", warranty: "ICE KM/KMD/IM: 36m P&L + 60m evap P&L + 60m parts compressor; DB Dispenser: 24m P&L; FM/DCM: 24m P&L + 60m parts compressor; Refrigeration: 24m P&L; Sushi 12m P&L; Ice Bins 12m", registration: "+6m ice / +12m fridge-freezer with 30-day registration", service: "On-site; travel >50km chargeable; 8am\u20134:30pm Mon\u2013Fri", equipment: "Ice makers, refrigeration, sushi cabinets, dispensers" },
  { brand: "Austral by Hussmann", claimAction: "Start Claim", warranty: "24m P&L from date of dispatch", registration: "\u2014", service: "Labour warranty metro only (50km radius from major city centre). Regular time hours only. Email warranty.aus@hussmann.com with serial + fault.", equipment: "Glass door display chillers" },
  { brand: "Hussmann (Display Refrigeration)", claimAction: "Start Claim", warranty: "24m P&L from date of dispatch", registration: "\u2014", service: "Labour warranty metro only (50km radius from major city centre). Regular time hours only. Travel, diagnostic charges, filters/gaskets/lamps/fuses excluded.", equipment: "Open deck display, merchandisers" },
  { brand: "Panasonic (Underbench & Upright Refrigeration)", claimAction: "Start Claim (via Hussmann)", warranty: "24m P&L from date of dispatch", registration: "\u2014", service: "Warranty service via Hussmann AU. Labour metro only (50km from major city centre).", equipment: "Underbench chillers/freezers, upright chillers/freezers, glass door fridges" },
  { brand: "ICARUS by ZESTI (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "13m P&L", registration: "\u2014", service: "On-site \u226450 km; otherwise charges/R2B", equipment: "Electric chargrills & ovens" },
  { brand: "ICE \u2014 Adler / Anvil", claimAction: "Start Claim", warranty: "12m P&L; +1m bonus with registration within 4 weeks", registration: "Registration recommended", service: "On-site metro; regional via ICE network", equipment: "Dishwashers, cooking, refrigeration" },
  { brand: "IMC (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "13m P&L", registration: "\u2014", service: "On-site \u226450 km; otherwise charges/R2B", equipment: "Waste & prep" },
  { brand: "Induc (Middleby)", claimAction: "Book Warranty Service", warranty: "12m P&L", registration: "Registration available", service: "On-site; travel charged >100 km", equipment: "Induction" },
  { brand: "Invoq (Middleby)", claimAction: "Book Warranty Service", warranty: "12m P&L", registration: "Registration available", service: "On-site; travel charged >100 km", equipment: "Hybrid combi ovens" },
  { brand: "IRINOX (via SKOPE)", claimAction: "Start Claim (SKOPE)", claimUrl: "https://www.skope.com/au/support/warranty/", warranty: "12m standard; 24m with registration within 4 weeks of invoice via SKOPE. Not registered = no warranty.", registration: "Registration required within 4 weeks", service: "Via SKOPE AU (1800 121 535). Installation report must be uploaded to Freshcloud within 5 days for 24m extension.", equipment: "Blast chillers, shock freezers, holding cabinets" },
  { brand: "JACKSTACK (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "13m P&L", registration: "\u2014", service: "On-site \u226450 km; otherwise charges/R2B", equipment: "Plate/jack stackers" },
  { brand: "JETSTREAM Tapware (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "5-year On-Site (install reqs apply)", registration: "\u2014", service: "On-site \u226450 km; PLVs required where specified", equipment: "Tapware" },
  { brand: "Coffee Machines & Equipment", claimAction: "Contact Us", warranty: "12m parts only \u2014 no labour warranty. Applies to all commercial coffee machines and coffee equipment.", registration: "\u2014", service: "Contact manufacturer or importer directly for service. We can assist with connecting you to the right service department.", equipment: "All commercial coffee machines" },
  { brand: "La Marzocco", claimAction: "Start Claim", warranty: "Commercial: 13m parts-only from date of shipment. Home (Linea Mini): 24m P&L.", registration: "Registration within 90 days; annual service by LM-approved tech required", service: "Via La Marzocco AU service network. Must be installed by LM-approved technician. Filtered water meeting LM specs required. Consumables not covered.", equipment: "Espresso machines" },
  { brand: "Liebherr (Andi-Co)", claimAction: "Contact Us", warranty: "36m standard; 60m with registration", registration: "Registration for 5yr", service: "Via Andi-Co service network AU-wide", equipment: "Refrigeration" },
  { brand: "Lincoln (Comcater)", claimAction: "Start Claim", claimUrl: "https://www.comcater.com.au/service-support/", warranty: "12m P&L", registration: "\u2014", service: "On-site metro; regional travel charges", equipment: "Impinger ovens" },
  { brand: "MagiKitch\u2019n (Middleby)", claimAction: "Book Warranty Service", warranty: "12m P&L", registration: "Registration available", service: "On-site; travel charged >100 km", equipment: "Charbroilers & griddles" },
  { brand: "Manitowoc Ice", claimAction: "Contact Us", warranty: "Up to 36m P&L", registration: "\u2014", service: "Contact us for service referral to correct AU distributor", equipment: "Ice machines" },
  { brand: "Meiko", claimAction: "Start Claim", warranty: "12m standard; 24m with registration (within 90 days); 4yr extended with maintenance ($2K)", registration: "Registration within 90 days for 24m", service: "AU-wide; metro 100km P&L; outside metro 2nd yr parts only; 1300 562 500", equipment: "Commercial dishwashing" },
  { brand: "MENUMASTER", claimAction: "Start Claim", warranty: "12m P&L", registration: "\u2014", service: "On-site metro; outside metro often R2B", equipment: "Commercial microwaves" },
  { brand: "Mercury (Middleby)", claimAction: "Book Warranty Service", warranty: "12m P&L", registration: "Registration available", service: "On-site; travel charged >100 km", equipment: "Cooking" },
  { brand: "Effeuno (via Meris)", claimAction: "Contact Meris", warranty: "12m standard from date of full payment.", registration: "\u2014", service: "Via Meris AU (1800 265 771)", equipment: "Pizza ovens" },
  { brand: "Flexeserve (via Meris)", claimAction: "Contact Meris", warranty: "12m standard from date of full payment.", registration: "\u2014", service: "Via Meris AU (1800 265 771)", equipment: "Heated food display (zone heating)" },
  { brand: "King Edward (via Meris)", claimAction: "Contact Meris", warranty: "12m standard from date of full payment.", registration: "\u2014", service: "Via Meris AU (1800 265 771)", equipment: "Potato ovens" },
  { brand: "Nemco (via Meris)", claimAction: "Contact Meris", warranty: "12m standard from date of full payment.", registration: "\u2014", service: "Via Meris AU (1800 265 771)", equipment: "Hot dog equipment, food warmers" },
  { brand: "PerfectFry (via Meris)", claimAction: "Contact Meris", warranty: "12m standard from date of full payment.", registration: "\u2014", service: "Via Meris AU (1800 265 771)", equipment: "Ventless deep fryers" },
  { brand: "Spidocook (via Meris)", claimAction: "Contact Meris", warranty: "12m standard from date of full payment.", registration: "\u2014", service: "Via Meris AU (1800 265 771)", equipment: "Hotplates, crepe skillets, contact grills" },
  { brand: "Tecnodom (via Meris)", claimAction: "Contact Meris", warranty: "12m standard from date of full payment.", registration: "\u2014", service: "Via Meris AU (1800 265 771)", equipment: "Upright fridges & freezers, underbench" },
  { brand: "Unis (via Meris)", claimAction: "Contact Meris", warranty: "12m standard from date of full payment.", registration: "\u2014", service: "Via Meris AU (1800 265 771)", equipment: "Heated food display cabinets" },
  { brand: "Middleby Marshall (Middleby)", claimAction: "Book Warranty Service", warranty: "12m P&L", registration: "Registration", service: "On-site; travel charged >100 km; 8\u20134 only", equipment: "Conveyor ovens" },
  { brand: "MISA Modular Coolrooms", claimAction: "Brand Page", warranty: "~24m (typical, subject to Epta T&Cs)", registration: "\u2014", service: "On-site metro via installer; regional travel charges; distance limits from metro apply", equipment: "Coolrooms & panels" },
  { brand: "Moffat (General)", claimAction: "Start Claim", claimUrl: "https://www.mfrbrands.com.au/service-and-warranty/warranty-claim/", warranty: "24m P&L (products purchased from 1 Sep 2024); 12m prior; spare parts 90 days", registration: "\u2014", service: "On-site metro; regional $2.13/km round trip; no registration required", equipment: "Cooking & bakery ranges" },
  { brand: "Neumaerker (via Meris)", claimAction: "Contact Meris", warranty: "12m standard (confirm with Meris)", registration: "\u2014", service: "Via Meris AU service (1800 265 771). R2B for countertop items.", equipment: "Waffle irons, cr\u00eape, jaffle, hot dog" },
  { brand: "Nieco (Middleby)", claimAction: "Book Warranty Service", warranty: "12m P&L", registration: "Registration available", service: "On-site; travel charged >100 km", equipment: "Broilers" },
  { brand: "Nu-Vu (Middleby)", claimAction: "Book Warranty Service", warranty: "12m P&L", registration: "Registration available", service: "On-site; travel charged >100 km", equipment: "Proofers & ovens" },
  { brand: "Ovention (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "13m P&L", registration: "\u2014", service: "On-site \u226450 km; otherwise charges/R2B", equipment: "Rapid cook ovens" },
  { brand: "Panasonic Commercial (Microwaves & Rice Cookers)", claimAction: "Product Range", warranty: "Complex \u2014 varies by model. Some commercial microwaves: 3 months only. Select models (NE-C1275, NE-1853, NE-SCV2): up to 24m. Rice cookers: 12m. Always confirm warranty period for the specific model at time of purchase.", registration: "\u2014", service: "Contact Hussmann AU for warranty service. Metro on-site where available; outside metro often R2B.", equipment: "Microwaves, rice cookers" },
  { brand: "Perlick (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "13m P&L", registration: "\u2014", service: "On-site \u226450 km; otherwise charges/R2B", equipment: "Beverage systems" },
  { brand: "Adventys Pro (via Phoeniks)", claimAction: "Contact Phoeniks", warranty: "24m P&L minimum (all Phoeniks-supplied equipment)", registration: "\u2014", service: "Via Phoeniks AU dealer network (Melbourne, Sydney, Brisbane showrooms)", equipment: "Professional induction cooktops" },
  { brand: "Brunner-Anliker (via Phoeniks)", claimAction: "Contact Phoeniks", warranty: "24m P&L minimum", registration: "\u2014", service: "Via Phoeniks AU dealer network", equipment: "Automatic vegetable cutting machines" },
  { brand: "Capic (via Phoeniks)", claimAction: "Contact Phoeniks", warranty: "24m P&L minimum", registration: "\u2014", service: "Via Phoeniks AU dealer network", equipment: "Tilting mixing kettles" },
  { brand: "Dor\u00e9grill (via Phoeniks)", claimAction: "Contact Phoeniks", warranty: "24m P&L minimum", registration: "\u2014", service: "Via Phoeniks AU dealer network. Rotisseries nationally certified to AU Standards.", equipment: "Rotisseries, display cooking" },
  { brand: "GIF ActiveVent (via Phoeniks)", claimAction: "Contact Phoeniks", warranty: "24m P&L minimum", registration: "\u2014", service: "Via Phoeniks AU dealer network", equipment: "Ventilated kitchen ceilings" },
  { brand: "MKN (via Phoeniks)", claimAction: "Contact Phoeniks", warranty: "24m P&L minimum", registration: "\u2014", service: "Via Phoeniks AU dealer network", equipment: "Combi ovens, modular cooking ranges, FlexiChef" },
  { brand: "Salvis (via Phoeniks)", claimAction: "Contact Phoeniks", warranty: "24m P&L minimum", registration: "\u2014", service: "Via Phoeniks AU dealer network", equipment: "Commercial cooking equipment, salamanders" },
  { brand: "Tournus (via Phoeniks)", claimAction: "Contact Phoeniks", warranty: "24m P&L minimum", registration: "\u2014", service: "Via Phoeniks AU dealer network", equipment: "Storage, transport, shelving, prep" },
  { brand: "Pitco (Middleby)", claimAction: "Book Warranty Service", warranty: "12m P&L", registration: "Registration available", service: "On-site; travel charged >100 km", equipment: "Fryers" },
  { brand: "Polar", claimAction: "Contact Us", warranty: "12m R2B", registration: "\u2014", service: "Via Uropa warranty service (1300 225 960). Credit card details required before service.", equipment: "Refrigeration" },
  { brand: "Prince Castle (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "13m P&L", registration: "\u2014", service: "On-site \u226450 km; otherwise charges/R2B", equipment: "Foodservice tools" },
  { brand: "Rational (AU)", claimAction: "Start Claim", warranty: "24m P&L (AU)", registration: "\u2014", service: "On-site via Rational partners; regional travel charges", equipment: "Combi & thermal systems" },
  { brand: "Roband (AU)", claimAction: "Start Claim", warranty: "12m P&L (AU)", registration: "\u2014", service: "Primarily R2B; drop-off at Cromer NSW HQ available; 1300 365 769", equipment: "Benchtop & countertop" },
  { brand: "Robot Coupe", claimAction: "Lodge Repair Request", warranty: "24m P&L R2B; collection & delivery free AU-wide; credit card pre-auth required. Exclusions: misuse/abuse, blade wear, cosmetic, unauthorised repair", registration: "Registration available", service: "R2B; free collection & return AU-wide via Robot Coupe logistics; no loan machines; no extended warranty available", equipment: "Food prep equipment" },
  { brand: "ROTOR (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "13m P&L", registration: "\u2014", service: "On-site \u226450 km; otherwise charges/R2B", equipment: "Juicers & blenders" },
  { brand: "Rowlett Rutland (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "13m P&L", registration: "\u2014", service: "On-site \u226450 km; otherwise charges/R2B", equipment: "Toasters & smalls" },
  { brand: "Sammic (AU)", claimAction: "Start Claim", warranty: "12m P&L; 18m with warranty card returned", registration: "Registration extends to 18m", service: "On-site (non-carriable) or R2B (carriable); customer bears freight both ways", equipment: "Food prep, warewash, vac" },
  { brand: "San Jamar (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "13m P&L", registration: "\u2014", service: "On-site \u226450 km; otherwise charges/R2B", equipment: "Safety & sanitation" },
  { brand: "Scotsman (Moffat)", claimAction: "Start Claim", claimUrl: "https://www.mfrbrands.com.au/service-and-warranty/warranty-claim/", warranty: "Up to 36m P&L", registration: "\u2014", service: "On-site metro; regional surcharges", equipment: "Ice machines" },
  { brand: "Simco (Atosa / CookRite)", claimAction: "Start Claim", warranty: "24m P&L + 24m parts only (48m total); consumables 12m only", registration: "Registration via form with credit card hold", service: "On-site within 50km GPO or 30km from service agent; outside: customer returns at own cost", equipment: "Cooking, refrigeration" },
  { brand: "Simply Stainless (Stoddart)", claimAction: "Start Claim", claimUrl: "https://www.stoddart.com.au/warranty/", warranty: "Lifetime Quality Guarantee (terms vary by product series)", registration: "Registration recommended", service: "Via Stoddart service network. Toll-free: 1300 307 289.", equipment: "Benches, sinks, shelving" },
  { brand: "Sirman", claimAction: "Contact Us", warranty: "12m P&L (confirm with distributor)", registration: "\u2014", service: "Via AU distributor; contact us for service referral", equipment: "Slicers, mixers, vac packers, grinders" },
  { brand: "Skipio", claimAction: "Start Claim", warranty: "24m P&L", registration: "Serial number lookup (no registration needed)", service: "On-site via Skipio techs (SYD/MEL); third-party techs in other states; out-of-warranty $180+GST call-out", equipment: "Refrigeration" },
  { brand: "SKOPE \u2014 ActiveCore", claimAction: "Start Claim", claimUrl: "https://www.skope.com/au/support/warranty/", warranty: "60m P&L (registration)", registration: "Registration required", service: "On-site; travel >100km or >1.5hr (lesser) chargeable; spare parts 12m replacement only (no labour)", equipment: "All ActiveCore" },
  { brand: "SKOPE \u2014 ProSpec (Freezers)", claimAction: "Start Claim", claimUrl: "https://www.skope.com/au/support/warranty/", warranty: "36m P&L (registration)", registration: "Registration required", service: "On-site; travel >100km or >1.5hr (lesser) chargeable", equipment: "All freezers" },
  { brand: "SKOPE \u2014 ProSpec (Fridges)", claimAction: "Start Claim", claimUrl: "https://www.skope.com/au/support/warranty/", warranty: "60m P&L (registration)", registration: "Registration required", service: "On-site; travel >100km or >1.5hr (lesser) chargeable", equipment: "All fridges" },
  { brand: "Smeg Professional (AU)", claimAction: "Start Claim", warranty: "Per Smeg Professional AU standard warranty", registration: "\u2014", service: "On-site via authorised AU partners", equipment: "Dishwashing & cooking" },
  { brand: "Synergy Grill (Stoddart)", claimAction: "Start Claim", claimUrl: "https://www.stoddart.com.au/warranty/", warranty: "24m P&L from date of installation", registration: "Registration recommended", service: "Via Stoddart service network. Toll-free: 1300 307 289.", equipment: "Chargrills" },
  { brand: "True Refrigeration (Bromic Group)", claimAction: "Start Claim", warranty: "60m (5yr) P&L \u2014 all products, standard", registration: "No registration required", service: "On-site via Bromic AU-wide technician network; after-hours available (customer pays surcharge)", equipment: "Reach-in fridges, freezers, prep tables" },
  { brand: "TurboAir", claimAction: "Start Claim", warranty: "36m P&L", registration: "Serial number required (no registration)", service: "On-site within 100km free; outside: travel charges; void if unauthorised repair", equipment: "Refrigeration" },
  { brand: "Turbochef (Stoddart)", claimAction: "Start Claim", claimUrl: "https://www.stoddart.com.au/warranty/", warranty: "12m P&L on-site from date of installation", registration: "Registration recommended", service: "On-site via Stoddart service network; travel >50km from nearest agent chargeable. Toll-free: 1300 307 289.", equipment: "Rapid cook / speed ovens" },
  { brand: "Turbofan (Moffat)", claimAction: "Start Claim", claimUrl: "https://www.mfrbrands.com.au/service-and-warranty/warranty-claim/", warranty: "24m P&L", registration: "\u2014", service: "On-site metro; regional surcharges", equipment: "Bakery & convection ovens" },
  { brand: "UNOX \u2014 LL4 (LONG.Life4)", claimAction: "Start Claim", warranty: "Labour to 24m; Parts to 48m", registration: "Connected \u226430 days; remote access", service: "On-site via UNOX AU partners; travel >50km outside metro chargeable", equipment: "CHEFTOP/BAKERTOP MIND.Maps\u2122, BAKERLUX SHOP.Pro\u2122" },
  { brand: "UNOX \u2014 LL5 (LONG.Life5)", claimAction: "Start Claim", warranty: "Labour to 24m / 12,000h; Parts to 60m / 12,000h", registration: "Requires Digital-ID\u2122 Premium + connectivity; register \u226430 days", service: "On-site via UNOX AU partners; travel >50km outside metro chargeable", equipment: "SPEED-X\u2122, CHEFTOP-X\u2122, BAKERTOP-X\u2122" },
  { brand: "UNOX \u2014 Standard", claimAction: "Start Claim", warranty: "12m P&L", registration: "Registration recommended", service: "On-site via UNOX AU partners; travel >50km outside metro chargeable", equipment: "General products" },
  { brand: "Vinotemp (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "13m P&L", registration: "\u2014", service: "On-site \u226450 km; otherwise charges/R2B", equipment: "Wine refrigeration" },
  { brand: "Vitamix (Commercial)", claimAction: "Start Claim (via SKOPE)", claimUrl: "https://www.skope.com/au/support/warranty/", warranty: "Commercial: 36m motor base / 12m P&L container + parts. Household warranty does NOT apply to commercial use.", registration: "\u2014", service: "R2B via SKOPE AU (1800 121 535); proof of purchase required", equipment: "Commercial blenders" },
  { brand: "VITO (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "12m P&L, R2B (except Vito X Vacuum Filtration)", registration: "\u2014", service: "R2B \u2014 customer returns unit to FSM", equipment: "Oil filtration systems" },
  { brand: "Waldorf (Moffat) \u2014 Fryer Tanks", claimAction: "Start Claim", claimUrl: "https://www.mfrbrands.com.au/service-and-warranty/warranty-claim/", warranty: "Frypot 120m (materials/welds)", registration: "\u2014", service: "On-site metro; regional surcharges", equipment: "Selected fryers" },
  { brand: "Waring Commercial", claimAction: "Contact Us", warranty: "12\u201324m (model dependent; confirm with distributor)", registration: "\u2014", service: "Via AU distributor; contact us for service referral", equipment: "Blenders, mixers, grills, toasters" },
  { brand: "Washtech (Moffat)", claimAction: "Start Claim", claimUrl: "https://www.mfrbrands.com.au/service-and-warranty/warranty-claim/", warranty: "5-2-2 warranty: cabinet 60m; wash pump 24m; P&L 24m", registration: "\u2014", service: "On-site metro 8am\u20134pm Mon\u2013Fri; regional $2.13/km round trip", equipment: "Dishwashers" },
  { brand: "Williams Refrigeration", claimAction: "Start Claim", warranty: "24m P&L (self-contained); 12m parts only (remote systems)", registration: "Registration form required", service: "On-site AU-wide via authorised techs each state; non-warranty confirmation required if no card details", equipment: "Refrigeration" },
  { brand: "Winterhalter", claimAction: "Start Claim", warranty: "24m P&L (Winterhalter & Classeq); spare parts 3m", registration: "Serial number verification (no registration needed)", service: "On-site via AU network; travel charges outside metro; $357.50 pre-deposit bond for prepaid customers (refunded if warranty valid); technicians all states", equipment: "Commercial dishwashing" },
  { brand: "Woodson (Stoddart)", claimAction: "Start Claim", claimUrl: "https://www.stoddart.com.au/warranty/", warranty: "12m P&L on-site from date of installation", registration: "Registration recommended", service: "On-site via Stoddart service network. Toll-free: 1300 307 289.", equipment: "Benchtop & countertop" },
  { brand: "Yasaki (FED)", claimAction: "Start Claim", warranty: "12m P&L", registration: "\u2014", service: "On-site metro where available; some R2B", equipment: "Processors, slicers, deli, vac, ice" },
  { brand: "Yellow Induction (FSM-PL)", claimAction: "Book a Service", claimUrl: "https://fsmpl.com.au/service/", warranty: "R2B (standard)", registration: "\u2014", service: "Customer returns unit", equipment: "Countertop induction" },
  { brand: "Zanussi (Luus)", claimAction: "Start Claim", warranty: "12m P&L standard; 24m with registration within 30 days", registration: "Registration for 24m", service: "On-site within 50km CBD or 30km from service agent; outside: customer returns or travel fee", equipment: "Magistar, Rapido, EVO700/900, Modular" },
];

export function WarrantyDirectory() {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return WARRANTY_DATA;
    const q = search.toLowerCase();
    return WARRANTY_DATA.filter(
      (e) =>
        e.brand.toLowerCase().includes(q) ||
        e.equipment.toLowerCase().includes(q) ||
        e.warranty.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div>
      <h3 className="text-lg font-semibold text-zinc-900 mb-1">
        Warranty &amp; Service Directory
      </h3>
      <p className="text-sm text-zinc-600 mb-4">
        Find your equipment manufacturer below to start a warranty claim, check
        coverage periods, or locate your nearest service agent across Australia.
      </p>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by brand, equipment type, or keyword\u2026"
          className="w-full rounded-lg border border-zinc-300 pl-10 pr-4 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block border border-zinc-200 overflow-hidden rounded-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 text-zinc-500">
                <th className="px-3 py-2.5 text-left font-medium">Brand / Series</th>
                <th className="px-3 py-2.5 text-left font-medium">Claim</th>
                <th className="px-3 py-2.5 text-left font-medium">Warranty (AU)</th>
                <th className="px-3 py-2.5 text-left font-medium">Registration</th>
                <th className="px-3 py-2.5 text-left font-medium">Service &amp; Travel</th>
                <th className="px-3 py-2.5 text-left font-medium">Equipment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((entry) => (
                <tr key={entry.brand} className="text-zinc-600">
                  <td className="px-3 py-2.5 font-medium text-zinc-900 whitespace-nowrap">
                    {entry.brand}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {entry.claimUrl ? (
                      <a
                        href={entry.claimUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {entry.claimAction}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-zinc-500">{entry.claimAction}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{entry.warranty}</td>
                  <td className="px-3 py-2.5">{entry.registration}</td>
                  <td className="px-3 py-2.5">{entry.service}</td>
                  <td className="px-3 py-2.5 text-zinc-500">{entry.equipment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {filtered.map((entry) => (
          <div key={entry.brand} className="border border-zinc-200 rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-medium text-zinc-900">{entry.brand}</h4>
              {entry.claimUrl ? (
                <a
                  href={entry.claimUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap inline-flex items-center gap-1"
                >
                  {entry.claimAction}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-xs text-zinc-500 whitespace-nowrap">{entry.claimAction}</span>
              )}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-zinc-400 font-medium">Warranty</dt>
              <dd className="text-zinc-600">{entry.warranty}</dd>
              <dt className="text-zinc-400 font-medium">Registration</dt>
              <dd className="text-zinc-600">{entry.registration}</dd>
              <dt className="text-zinc-400 font-medium">Service</dt>
              <dd className="text-zinc-600">{entry.service}</dd>
              <dt className="text-zinc-400 font-medium">Equipment</dt>
              <dd className="text-zinc-500">{entry.equipment}</dd>
            </dl>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-zinc-500 py-8 text-center">
          No brands found matching &ldquo;{search}&rdquo;. Try a different search term.
        </p>
      )}

      {/* Footer note */}
      <div className="mt-6 border-t border-zinc-200 pt-4">
        <p className="text-xs text-zinc-400 leading-relaxed">
          <strong>Brand not listed?</strong> Call 1800 431 323 or email{" "}
          <a href="mailto:cs@industrykitchens.com.au" className="text-blue-600 hover:text-blue-800">
            cs@industrykitchens.com.au
          </a>{" "}
          &mdash; our team will connect you with the right manufacturer or importer
          service department. We work with 160+ suppliers across Australia.
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed mt-2">
          <strong>Important:</strong> &ldquo;On-site&rdquo; generally means metropolitan areas
          during business hours. Most brands apply regional travel charges outside
          metro or beyond a set distance. &ldquo;R2B&rdquo; means Return-to-Base &mdash; the
          customer is responsible for shipping the unit to the service agent.
          Consumables and wear parts (globes, seals, blades, filters) are
          typically excluded from warranty.
        </p>
      </div>
    </div>
  );
}
