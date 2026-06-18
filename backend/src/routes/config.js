const express = require('express');
const settings = require('../services/settings');

const router = express.Router();

router.get('/', (_req, res) => {
  const all = settings.getAll();
  res.json({
    businessCenterName: all.business_center_name,
    workingHoursFrom: all.working_hours_from,
    workingHoursTo: all.working_hours_to,
    contactPhone: all.contact_phone,
    contactEmail: all.contact_email,
    receptionFloor: all.reception_floor,
    maxPassesPerDay: parseInt(all.max_passes_per_day, 10),
  });
});

module.exports = router;