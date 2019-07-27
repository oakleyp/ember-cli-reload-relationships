import Mixin from '@ember/object/mixin';
import { Promise, all } from 'rsvp';

export default Mixin.create({
    _relationshipsReloadable: true,

    /**
     * Reloads all relationships for this model
     * 
     * @param {Object} reloaded - An object containing 
     * 
     * @returns {Promise} - a promise that resolves once all relationships have finished reloading
     */
    reloadRelationships(reloaded = {}) {
        return new Promise(resolve => {

            // Build a unique ID for this model so that we can track whether its relationships have been reloaded already
            const model = this.constructor;
            const modelName = model.modelName || model.typeKey;
            const id = `${modelName}--${this.get('id')}`;

            // If the current model has already had its relationships reloaded, resolve to the current model value
            if (reloaded[id]) {
                return resolve(reloaded[id]);
            }

            const queue = [];
            reloaded[id] = this;

            // Go through each relationship and call reload() on that "hasManyReference" or "belongsToReference"
            // reload() resolves to the reloaded model instead of a reference, from which we can get that model's relationships.
            // If the reloaded model also extends this mixin (has _relationshipsReloadable), call reloadRelationships() for that model.
            this.eachRelationship((name, descriptor) => {
                if (!['hasMany', 'belongsTo'].includes(descriptor.kind)) {
                    return; // skip this relationship if it's not a belongsTo or hasMany or this property is listed in _noReload
                }
                        
                const relationshipRef = this[descriptor.kind](name);
                const reloadPromise = relationshipRef.reload();  

                // If reload() for the current relationship property returns undefined, leave the property as-is
                if (!reloadPromise || typeof reloadPromise.then !== 'function') {
                    return queue.push(Promise.resolve(this.get(name)));
                }
                
                reloadPromise.then(reloadedRel => {
                    if ('hasMany' === descriptor.kind) { // reload all items in hasMany and replace this model's hasMany with the result
                        all(reloadedRel.map(relItem => 
                                relItem.get('_relationshipsReloadable') ?
                                    relItem.reloadRelationships(reloaded) :
                                    Promise.resolve(relItem)
                            )
                        ).then(rel => this.set(name, rel));
                    } else { // reload belongsTo and replace this model's belongsTo with the result
                        if (reloadedRel.get('_relationshipsReloadable')) {
                            return reloadedRel.reloadRelationships(reloaded).then(rel =>
                                this.set(name, rel)
                            );
                        }

                        this.set(name, reloadedRel);
                    }
                });

                queue.push(reloadPromise);
            });

            return all(queue).then(() => {
                resolve(this);
            })
        }); 

    },
});