---
name: pyr-business-context
description: Business knowledge for Puppy Yoga Retreat that supplements the query tools with context the API doesn't provide
---

## Business Context

This skill provides the business knowledge that tool responses alone don't cover. Use this context to give richer, more helpful answers.

## Room Types & Pricing

| Room Type | Description | Base Price/Night | Max Occupancy |
|-----------|-------------|-----------------|---------------|
| Suite | Premium room with private balcony, sea view, and en-suite bathroom | Varies by season | 2 |
| Standard | Comfortable room with shared facilities, garden view | Varies by season | 2 |

**Pricing rules:**
- All amounts are in EUR (stored as integer cents internally)
- Base prices are per night and vary by room type
- Seasonal multipliers adjust pricing (e.g., summer peak season is higher)
- Use `check_availability` tool to get accurate pricing for specific dates -- never quote from memory
- Season overlap is prevented at the database level

## Retreat Packages

### 4-Day Wellness Package
- 3 nights accommodation
- Daily yoga and meditation sessions (morning and evening)
- All meals included (vegetarian, with dietary accommodation on request)
- Daily puppy interaction time
- One guided beach walk with puppies
- Perfect for a long weekend escape

### 7-Day Wellness Package
- 6 nights accommodation
- Everything in the 4-day package, plus:
- Additional excursions (village tours, beach days)
- Deeper yoga practice with progressive sessions
- Extended puppy socialization time
- The full retreat experience for deeper relaxation

## Event Types

| Event | Duration | Typical Capacity | Typical Schedule |
|-------|----------|-----------------|------------------|
| Puppy Yoga Class | 90 min | ~8 participants | Morning rooftop sessions |
| Puppy Beach Walk | ~120 min | ~10 participants | Late afternoon, weather permitting |
| Coffee, Cake & Cuddles | ~60 min | ~12 participants | Mid-morning or afternoon |
| Retreat (multi-day) | 4 or 7 days | Depends on rooms | Handled via bookings, not events |

## Location Details

- **Address:** Peyia, 8560, Paphos District, Cyprus
- **Timezone:** Europe/Nicosia (EET/EEST, UTC+2 winter / UTC+3 summer)
- **Nearest airport:** Paphos International Airport (PFO), ~30 min by car
- **Climate:** Mediterranean -- warm dry summers, mild winters, generally sunny year-round
- **Currency:** EUR

## Booking Status Flow

```
inquiry --> confirmed --> checked_in --> checked_out
    |           |             |
    +-----------+-------------+---> cancelled (from any state)
```

- **Inquiry:** Initial interest, not yet confirmed. May need pricing info or follow-up.
- **Confirmed:** Booking is locked in. Room assigned, dates set.
- **Checked In:** Guest has arrived and is currently at the retreat.
- **Checked Out:** Stay completed. Guest has departed.
- **Cancelled:** Booking was cancelled at any stage.

## Common Questions & How to Handle

### "What's the price?"
Always use `check_availability` or `list_room_types` to get current pricing. Never quote from memory -- prices vary by season and room type.

### "Is there availability for [dates]?"
Use `check_availability` with the requested dates. Report which rooms are available and their pricing.

### "How many bookings do we have?"
Use `list_bookings` with appropriate status filter. For an overview, use `get_dashboard_stats`.

### "Who's checking in tomorrow?"
Use `get_today_schedule` for today, or `list_bookings` with a date filter for other days.

### "What's the revenue?"
Use `get_dashboard_stats` for this month's revenue. For custom periods, use `list_bookings` with date filters and sum the totals.

### "Any new messages?"
Use `list_conversations` with status "open" to see unread/active conversations.

## The Puppies

All puppies are **rescues from local shelters** in the Paphos region. Key facts:
- Partner with local rescue organizations
- Puppies get love, socialization, and adoption opportunities
- Many have found forever homes through retreat guests
- Availability varies daily (adoptions, vet visits, new arrivals)
- Never promise specific puppies will be present
