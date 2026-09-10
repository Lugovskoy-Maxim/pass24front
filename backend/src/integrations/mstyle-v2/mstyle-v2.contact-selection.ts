import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MstyleContact,
  MstyleContactAssignment,
  MstyleIdentity,
  MstyleMembership,
} from './mstyle-v2.schemas';
import { membershipIsEffective } from './mstyle-v2.membership-policy';
import { MstyleIdentityService } from './mstyle-v2.identities';

type SelectedContact = {
  assignment: MstyleContactAssignment;
  contact: MstyleContact;
  identity: MstyleIdentity;
};

@Injectable()
export class MstyleContactSelectionService {
  constructor(
    @InjectModel(MstyleContactAssignment.name)
    private readonly assignments: Model<MstyleContactAssignment>,
    @InjectModel(MstyleContact.name)
    private readonly contacts: Model<MstyleContact>,
    private readonly identities: MstyleIdentityService,
    @InjectModel(MstyleMembership.name)
    private readonly memberships: Model<MstyleMembership>,
  ) {}

  async select(profileId: string, purpose = 'primary') {
    const rows = await this.assignments
      .find({ profileId, purpose, status: 'active' })
      .sort({ priority: 1, updatedAt: -1 })
      .lean();
    const selected: {
      phone: SelectedContact | null;
      email: SelectedContact | null;
    } = { phone: null, email: null };
    const now = Date.now();
    for (const assignment of rows) {
      const type = assignment.contactType;
      if ((type !== 'phone' && type !== 'email') || selected[type]) continue;
      const membership = await this.memberships
        .findOne({ profileId, subject: assignment.subject })
        .lean();
      if (!membershipIsEffective(membership, now)) continue;
      const identity = await this.identities.findIdentityBySubject(
        assignment.subject,
      );
      if (!identity || identity.identityStatus !== 'active') continue;
      const contact = await this.contacts
        .findOne({
          contactId: assignment.contactId,
          subject: assignment.subject,
          type,
        })
        .lean();
      if (!contact || !contact.verifiedAt) continue;
      selected[type] = { assignment, contact, identity };
    }
    return {
      ...selected,
      identity: (selected.phone || selected.email)?.identity ?? null,
      sourceRevisions: {
        profileContactAssignments: {
          phone: selected.phone?.assignment.revision ?? null,
          email: selected.email?.assignment.revision ?? null,
        },
        contactIdentity:
          (selected.phone || selected.email)?.identity.revision ?? null,
        identityContacts: {
          phone: selected.phone?.contact.revision ?? null,
          email: selected.email?.contact.revision ?? null,
        },
      },
    };
  }
}
